import { produce, serviceTrain, stopStationFor } from '../cargo/stations';
import { TICK_SECONDS } from '../constants';
import { fuelPerUnit } from '../economy/fuel';
import type { Ledger } from '../economy/ledger';
import type { GameState, RulesContext, RunState } from '../game/state';
import { neighbor, oppositePort } from '../grid/ports';
import { evaluateOutcome } from '../objectives/objectives';
import { routeLength } from '../track/geometry';
import { inBounds, stationAt, terrainAt, trackAt, type WorldState } from '../world/world';
import { exitFor } from './routing';
import type { CellPass, TrainState, TrainStatus } from './train';

export { TICK_SECONDS };

const EPSILON = 1e-9;

export type SimEvent =
  | { readonly type: 'train_blocked'; readonly trainId: string }
  | { readonly type: 'train_derailed'; readonly trainId: string }
  | { readonly type: 'train_out_of_fuel'; readonly trainId: string }
  | {
      readonly type: 'cargo_delivered';
      readonly trainId: string;
      readonly stationId: string;
      readonly revenue: number;
    }
  | { readonly type: 'level_completed' }
  | { readonly type: 'level_failed'; readonly reason: string };

export type StepResult = { readonly state: GameState; readonly events: readonly SimEvent[] };

type Ahead = { kind: 'pass'; pass: CellPass } | { kind: 'blocked' } | { kind: 'derailed' };

/** What lies beyond the head cell's exit. */
function lookAhead(world: WorldState, ctx: RulesContext, head: CellPass): Ahead {
  if (head.exit === null) return { kind: 'blocked' }; // buffer stop: trains never reverse
  const cell = neighbor(head.cell, head.exit);
  if (!inBounds(world, cell)) return { kind: 'blocked' };
  const track = trackAt(world, cell);
  const piece = track && ctx.catalogs.pieces[track.piece];
  if (!track || !piece) return { kind: 'blocked' };
  const entry = oppositePort(head.exit);
  const exit = exitFor(piece, track.rotation, track.state, entry);
  if (exit === undefined) return { kind: 'derailed' };
  return { kind: 'pass', pass: { cell, entry, exit } };
}

/** Mutable accumulators shared by all trains during one tick (applied in train order). */
type TickShared = { run: RunState; ledger: Ledger; events: SimEvent[] };

function burnFuel(shared: TickShared, trainId: string, amount: number): void {
  if (amount <= 0) return;
  const { run } = shared;
  shared.run = {
    ...run,
    fuelUsedTotal: run.fuelUsedTotal + amount,
    fuelUsedByTrain: {
      ...run.fuelUsedByTrain,
      [trainId]: (run.fuelUsedByTrain[trainId] ?? 0) + amount,
    },
  };
}

function stepTrain(
  train: TrainState,
  state: GameState,
  ctx: RulesContext,
  shared: TickShared,
): TrainState {
  if (train.status === 'derailed' || train.status === 'out_of_fuel') return train;
  const loco = ctx.catalogs.locomotives[train.locomotive];
  if (!loco) return train;
  const { world } = state;
  const terrain = ctx.catalogs.terrains[terrainAt(world, train.head.cell) ?? ''];
  const idle = train.running ? loco.fuelIdlePerSecond * TICK_SECONDS : 0;

  // Station stop in progress: the engine idles until the dwell time is over.
  if (train.status === 'loading') {
    const fuel = Math.max(0, train.fuel - idle);
    burnFuel(shared, train.id, train.fuel - fuel);
    const dwellRemaining = train.dwellRemaining - TICK_SECONDS;
    if (dwellRemaining > EPSILON) return { ...train, fuel, dwellRemaining };
    return { ...train, fuel, dwellRemaining: 0, status: train.running ? 'running' : 'stopped' };
  }

  const target = train.running ? loco.maxSpeed : 0;
  const delta = loco.acceleration * TICK_SECONDS;
  const speed =
    train.speed < target
      ? Math.min(target, train.speed + delta)
      : Math.max(target, train.speed - delta);
  let distance = speed * (terrain?.speedMultiplier ?? 1) * TICK_SECONDS;

  // Fuel limits how far the train can go this tick.
  const rate = fuelPerUnit(train, ctx.catalogs, terrain);
  const reach = rate > 0 ? train.fuel / rate : Infinity;
  const runsDry = distance > 0 && distance >= reach;
  if (runsDry) distance = reach;

  let { head, trail, progress, lastStation } = train;
  let status: TrainStatus = speed > 0 ? 'running' : 'stopped';
  let moved = 0;
  let stopAt: ReturnType<typeof stopStationFor> = undefined;

  // A running train also enters the loop at zero distance (first tick of acceleration), so it
  // can stop at a platform it is already standing on; every branch below breaks or advances.
  while (distance > EPSILON || (train.running && moved === 0)) {
    const length = routeLength(head.entry, head.exit);
    // Stop at the middle of the last platform cell (spec.md §4.5).
    const station = train.running ? stopStationFor(world, head) : undefined;
    if (station && station.id !== lastStation && progress <= length / 2 + EPSILON) {
      const toStop = Math.max(0, length / 2 - progress);
      if (distance >= toStop) {
        moved += toStop;
        progress = length / 2;
        stopAt = station;
        break;
      }
    }
    const room = length - progress;
    if (distance < room) {
      progress += distance;
      moved += distance;
      break;
    }
    distance -= room;
    moved += room;
    progress = length;
    const ahead = lookAhead(world, ctx, head);
    if (ahead.kind !== 'pass') {
      status = ahead.kind;
      break;
    }
    trail = trail.length ? [head, ...trail.slice(0, -1)] : [];
    head = ahead.pass;
    progress = 0;
    if (stationAt(world, head.cell)?.id !== lastStation) lastStation = null;
    if (distance <= EPSILON) break;
  }

  const burned = Math.min(train.fuel, moved * rate + (moved === 0 ? idle : 0));
  burnFuel(shared, train.id, burned);
  let next: TrainState = {
    ...train,
    head,
    trail,
    progress,
    lastStation,
    fuel: train.fuel - burned,
    speed: status === 'blocked' || status === 'derailed' ? 0 : speed,
    status,
  };

  if (runsDry || next.fuel <= EPSILON) {
    next = { ...next, fuel: 0, speed: 0, status: 'out_of_fuel' };
    shared.events.push({ type: 'train_out_of_fuel', trainId: train.id });
    return next;
  }

  if (stopAt) {
    const service = serviceTrain(next, stopAt, shared.run, shared.ledger, state.initialMoney, ctx);
    shared.run = service.run;
    shared.ledger = service.ledger;
    if (service.revenue > 0) {
      shared.events.push({
        type: 'cargo_delivered',
        trainId: train.id,
        stationId: stopAt.id,
        revenue: service.revenue,
      });
    }
    return {
      ...service.train,
      speed: 0,
      status: 'loading',
      dwellRemaining: stopAt.dwellSeconds,
      lastStation: stopAt.id,
    };
  }

  if ((status === 'blocked' || status === 'derailed') && train.status !== status) {
    shared.events.push({
      type: status === 'blocked' ? 'train_blocked' : 'train_derailed',
      trainId: train.id,
    });
  }
  return next;
}

/** Advances the simulation by one fixed tick. Pure and deterministic (spec.md §4.8). */
export function step(state: GameState, ctx: RulesContext): StepResult {
  const shared: TickShared = { run: state.run, ledger: state.ledger, events: [] };
  const trains = state.trains.map((train) => stepTrain(train, state, ctx, shared));
  const run = produce(shared.run, state.world.stations, TICK_SECONDS);
  let next: GameState = {
    ...state,
    trains,
    run,
    ledger: shared.ledger,
    elapsedTicks: state.elapsedTicks + 1,
  };
  const outcome = evaluateOutcome(next, ctx);
  if (outcome && !state.run.outcome) {
    next = { ...next, run: { ...next.run, outcome } };
    shared.events.push(
      outcome.kind === 'completed'
        ? { type: 'level_completed' }
        : { type: 'level_failed', reason: outcome.reason },
    );
  }
  return { state: next, events: shared.events };
}

/** Advances several ticks at once (used by the render loop and tests). Stops when the level ends. */
export function advance(state: GameState, ctx: RulesContext, ticks: number): StepResult {
  let current = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks && !current.run.outcome; i++) {
    const result = step(current, ctx);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}
