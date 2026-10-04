import { balance, roundMoney } from '../economy/ledger';
import type { GameState, RulesContext } from '../game/state';
import { TICK_SECONDS } from '../constants';
import type { TrainState } from '../sim/train';

/** Returns a player-facing reason when the level can no longer be won, else null. */
export type FailureCheck = (state: GameState, ctx: RulesContext) => string | null;

const remaining = (state: GameState, ctx: RulesContext) =>
  ctx.objectives.filter((o) => (state.run.delivered[o.to]?.[o.cargo] ?? 0) < o.amount);

/** 1. The time limit ran out. */
export const timeIsUp: FailureCheck = (state, ctx) => {
  const limit = ctx.constraints.timeLimitSeconds;
  return limit !== undefined && state.elapsedTicks * TICK_SECONDS >= limit ? 'Time is up' : null;
};

/** 2. Not enough cargo exists (delivered + carried + waiting + still to be produced). */
export const cargoUnreachable: FailureCheck = (state, ctx) => {
  const limit = ctx.constraints.timeLimitSeconds;
  const secondsLeft = limit === undefined ? Infinity : limit - state.elapsedTicks * TICK_SECONDS;
  for (const objective of remaining(state, ctx)) {
    const { cargo } = objective;
    const delivered = state.run.delivered[objective.to]?.[cargo] ?? 0;
    const inTransit = state.trains
      .flatMap((t) => t.wagons)
      .reduce((sum, w) => sum + (w.cargo === cargo ? w.amount : 0), 0);
    let available = 0;
    let producible = 0;
    for (const station of state.world.stations) {
      const supply = station.supplies.find((s) => s.cargo === cargo);
      if (!supply) continue;
      available += state.run.inventories[station.id]?.[cargo] ?? 0;
      if (supply.ratePerMinute > 0) producible += (supply.ratePerMinute / 60) * secondsLeft;
    }
    if (delivered + inTransit + available + producible < objective.amount) {
      const name = ctx.catalogs.cargoTypes[cargo]?.name ?? cargo;
      return `Not enough ${name.toLowerCase()} left`;
    }
  }
  return null;
};

const isOperational = (train: TrainState) =>
  train.fuel > 0 &&
  (train.status === 'running' || train.status === 'stopped' || train.status === 'loading');

/** Cheapest train that could still carry a cargo the objectives need, with a full tank. */
export function minRecoveryCost(state: GameState, ctx: RulesContext): number {
  const { catalogs, rules, economy } = ctx;
  const allowed = <T extends { id: string }>(items: Record<string, T>, list?: readonly string[]) =>
    Object.values(items).filter((i) => list?.includes(i.id) ?? true);
  const locos = allowed(catalogs.locomotives, rules.allowedLocomotives);
  const needed = new Set(remaining(state, ctx).map((o) => o.cargo));
  const wagons = allowed(catalogs.wagons, rules.allowedWagons).filter((w) =>
    w.accepts.some((c) => needed.has(c)),
  );
  const loco = Math.min(...locos.map((l) => l.cost + l.fuelCapacity * economy.fuelPrice));
  const wagon = wagons.length ? Math.min(...wagons.map((w) => w.cost)) : 0;
  return roundMoney(loco + wagon);
}

/** 3. No train can work and there is not enough money (plus scrap value) to buy one. */
export const bankrupt: FailureCheck = (state, ctx) => {
  if (state.trains.some(isOperational)) return null;
  const money = balance(state.initialMoney, state.ledger);
  if (money === null) return null;
  const scrap = state.trains.reduce((sum, t) => sum + t.purchaseValue * ctx.economy.refundRatio, 0);
  return money + scrap < minRecoveryCost(state, ctx) ? 'No trains and not enough money' : null;
};

/** Checked in order after every tick; add new rules here (spec.md §4.13). */
export const FAILURE_CHECKS: readonly FailureCheck[] = [timeIsUp, cargoUnreachable, bankrupt];
