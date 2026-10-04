import { describe, expect, it } from 'vitest';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { LevelInput } from '../../data/schemas/level';
import { makeGame, makeLevel, testCatalogs } from '../../test/fixtures';
import { produce, serviceTrain } from '../cargo/stations';
import { TICK_SECONDS } from '../constants';
import { applyAction } from '../editor/actions';
import { fuelPerUnit, trainWeight } from '../economy/fuel';
import { EMPTY_LEDGER } from '../economy/ledger';
import { emptyRun, moneyOf, type GameState, type RulesContext } from '../game/state';
import { bankrupt, minRecoveryCost } from '../objectives/failureChecks';
import { evaluateOutcome, objectiveProgress, starsFor } from '../objectives/objectives';
import { enterRunMode, setTrainRunning } from './commands';
import { advance } from './step';
import type { TrainState } from './train';

type TrackInput = NonNullable<LevelInput['map']['tracks']>[number];
type StationInput = NonNullable<LevelInput['map']['stations']>[number];
const at = (x: number, y: number) => ({ x, y });

/** Same catalogs, but locomotives reach full speed instantly. */
const instant: Catalogs = {
  ...testCatalogs,
  locomotives: Object.fromEntries(
    Object.entries(testCatalogs.locomotives).map(([id, l]) => [id, { ...l, acceleration: 1e9 }]),
  ),
};

/** A north-running line x=5, y=0..30 with platform cells where stations are. */
function line(stations: StationInput[], extra: Partial<LevelInput> = {}, catalogs = instant) {
  const platforms = new Set(stations.flatMap((s) => s.cells.map((c) => `${c.x},${c.y}`)));
  const tracks: TrackInput[] = Array.from({ length: 31 }, (_, y) => ({
    at: at(5, y),
    piece: platforms.has(`5,${y}`) ? 'station_track' : 'straight',
    rotation: 0,
  }));
  const { state, ctx } = makeGame(makeLevel({ tracks, stations }, extra));
  return { state, ctx: { ...ctx, catalogs } };
}

const station = (id: string, ys: number[], rest: Partial<StationInput> = {}): StationInput => ({
  id,
  name: id,
  cells: ys.map((y) => at(5, y)),
  dwellSeconds: 1,
  ...rest,
});

function withTrain(
  state: GameState,
  ctx: RulesContext,
  cell: { x: number; y: number },
  wagons: string[],
  locomotive = 'loco_steam',
): GameState {
  const outcome = applyAction(state, ctx, {
    type: 'placeTrain',
    cell,
    locomotive,
    wagons,
    facing: 'N',
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  const running = setTrainRunning(enterRunMode(outcome.state), 't1', true);
  if (!running.ok) throw new Error(running.reason);
  return running.state;
}

const only = (state: GameState): TrainState => {
  const [train] = state.trains;
  if (!train) throw new Error('no train');
  return train;
};

describe('Feature: Loading and unloading at stations', () => {
  it('Scenario: Load at the origin', () => {
    const { state, ctx } = line([
      station('st_A', [18, 19, 20], {
        supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 50 }],
      }),
    ]);
    const after = advance(
      withTrain(state, ctx, at(5, 25), ['wagon_hopper', 'wagon_hopper']),
      ctx,
      100,
    ).state;
    expect(only(after).wagons.map((w) => [w.cargo, w.amount])).toEqual([
      ['coal', 30],
      ['coal', 20],
    ]);
    expect(after.run.inventories['st_A']?.['coal']).toBe(0);
  });

  it('Scenario: Incompatible wagon', () => {
    const { state, ctx } = line([
      station('st_A', [18, 19, 20], {
        supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 50 }],
      }),
    ]);
    const after = advance(withTrain(state, ctx, at(5, 25), ['wagon_pax']), ctx, 100).state;
    expect(only(after).wagons[0]).toMatchObject({ cargo: null, amount: 0 });
    expect(after.run.inventories['st_A']?.['coal']).toBe(50);
  });

  it('Scenario: Unloading at the destination pays money', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18, 19, 20], {
          supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 30 }],
        }),
        station('st_B', [3, 4, 5], { demands: [{ cargo: 'coal' }] }),
      ],
      { economy: { initialMoney: 1000, fuelPrice: 0, payOverrides: { coal: 6 } } },
    );
    const start = withTrain(state, ctx, at(5, 25), ['wagon_hopper']);
    const money = moneyOf(start) ?? 0;
    const { state: after, events } = advance(start, ctx, 400);
    expect(only(after).wagons[0]).toMatchObject({ cargo: null, amount: 0 });
    expect(after.run.delivered['st_B']).toEqual({ coal: 30 });
    expect(moneyOf(after)).toBe(money + 180);
    expect(events).toContainEqual({
      type: 'cargo_delivered',
      trainId: 't1',
      stationId: 'st_B',
      revenue: 180,
    });
  });

  it('Scenario: Production over time', () => {
    const stations = [
      station('st_A', [18], {
        supplies: [{ cargo: 'coal', ratePerMinute: 10, capacity: 100, initial: 0 }],
      }),
    ];
    let run = emptyRun(
      stations.map((s) => ({ ...s, supplies: s.supplies ?? [], demands: [], services: [] })),
    );
    const parsed = makeLevel({
      stations,
      tracks: [{ at: at(5, 18), piece: 'station_track', rotation: 0 }],
    });
    for (let i = 0; i < 1200; i++) run = produce(run, parsed.map.stations, TICK_SECONDS);
    expect(run.inventories['st_A']?.['coal']).toBeCloseTo(10, 6);
    for (let i = 0; i < 100_000; i++) run = produce(run, parsed.map.stations, 1);
    expect(run.inventories['st_A']?.['coal']).toBe(100);
  });

  it('stops once per visit, for the dwell time, and keeps going afterwards', () => {
    const { state, ctx } = line([station('st_A', [18, 19, 20], { dwellSeconds: 2 })]);
    const start = withTrain(state, ctx, at(5, 25), []);
    // Heading north, the last platform cell is (5,18): 7 cells at 2 cells/s = 70 ticks.
    const arrived = advance(start, ctx, 71).state;
    expect(only(arrived)).toMatchObject({ status: 'loading', head: { cell: at(5, 18) } });
    const waiting = advance(arrived, ctx, 30).state; // 1.5 s of the 2 s dwell: still loading
    expect(only(waiting).status).toBe('loading');
    const gone = advance(waiting, ctx, 40).state;
    expect(only(gone).status).toBe('running');
    expect(only(gone).head.cell.y).toBeLessThan(18);
    expect(only(gone).lastStation).toBeNull(); // left the platform
  });

  it('a train placed on the last platform cell stops there as soon as it starts', () => {
    const { state, ctx } = line([
      station('st_A', [8, 9, 10], {
        supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 10 }],
      }),
    ]);
    const after = advance(withTrain(state, ctx, at(5, 8), ['wagon_hopper']), ctx, 2).state;
    expect(only(after)).toMatchObject({ status: 'loading', lastStation: 'st_A' });
    expect(only(after).wagons[0]?.amount).toBe(10);
  });
});

describe('Feature: Fuel consumption and purchase', () => {
  it('Scenario: Consumption per cell with no load', () => {
    const { state, ctx } = line([]);
    const start = withTrain(state, ctx, at(5, 25), []);
    const after = advance(start, ctx, 100).state; // 5 s × 2 cells/s = 10 cells
    expect(after.run.fuelUsedTotal).toBeCloseTo(10, 6);
    expect(only(after).fuel).toBeCloseTo(490, 6);
    expect(after.run.fuelUsedByTrain['t1']).toBeCloseTo(10, 6);
  });

  it('Scenario: Load increases consumption', () => {
    const train = {
      locomotive: 'loco_steam',
      wagons: [{ model: 'wagon_hopper', cargo: 'coal', amount: 30 }],
    } as unknown as TrainState;
    expect(trainWeight(train, testCatalogs)).toBe(102);
    expect(fuelPerUnit(train, testCatalogs, testCatalogs.terrains['grass'])).toBeCloseTo(1.7, 6);
  });

  it('Scenario: Terrain multiplies consumption', () => {
    const train = { locomotive: 'loco_steam', wagons: [] } as unknown as TrainState;
    expect(fuelPerUnit(train, testCatalogs, testCatalogs.terrains['snow'])).toBeCloseTo(1.3, 6);
    const unknown = { locomotive: 'ufo', wagons: [] } as unknown as TrainState;
    expect(fuelPerUnit(unknown, testCatalogs, undefined)).toBe(0);
  });

  const fuelStation = station('st_F', [10], { services: ['fuel'] });
  const lowTrain = (fuel: number) =>
    ({ locomotive: 'loco_steam', wagons: [], fuel, autoRefuel: true }) as unknown as TrainState;

  it('Scenario: Refuel at a fuel station', () => {
    const { ctx } = line([]);
    const parsed = makeLevel({
      tracks: [{ at: at(5, 10), piece: 'station_track', rotation: 0 }],
      stations: [fuelStation],
    });
    const s = parsed.map.stations[0];
    if (!s) throw new Error('no station');
    const result = serviceTrain(lowTrain(100), s, emptyRun([]), EMPTY_LEDGER, 1000, {
      ...ctx,
      economy: { ...ctx.economy, fuelPrice: 0.5 },
    });
    expect(result.train.fuel).toBe(500);
    expect(result.ledger.fuel).toBe(200);
    expect(result.run.fuelBoughtTotal).toBe(400);
  });

  it('Scenario: Partial refuel when money is short', () => {
    const { ctx } = line([]);
    const parsed = makeLevel({
      tracks: [{ at: at(5, 10), piece: 'station_track', rotation: 0 }],
      stations: [fuelStation],
    });
    const s = parsed.map.stations[0];
    if (!s) throw new Error('no station');
    const result = serviceTrain(lowTrain(100), s, emptyRun([]), EMPTY_LEDGER, 50, {
      ...ctx,
      economy: { ...ctx.economy, fuelPrice: 0.5 },
    });
    expect(result.train.fuel).toBe(200);
    expect(result.ledger.fuel).toBe(50);
  });

  it('Scenario: Out of fuel', () => {
    const { state, ctx } = line([]);
    const start = withTrain(state, ctx, at(5, 25), []);
    const lowFuel = { ...start, trains: start.trains.map((t) => ({ ...t, fuel: 0.5 })) };
    const { state: after, events } = advance(lowFuel, ctx, 40);
    expect(only(after)).toMatchObject({ status: 'out_of_fuel', speed: 0, fuel: 0 });
    expect(events).toContainEqual({ type: 'train_out_of_fuel', trainId: 't1' });
    // It travelled exactly as far as half a unit of fuel allows.
    expect(only(after).progress).toBeCloseTo(1, 6);
  });

  it('a running engine idles while waiting at a station', () => {
    const { state, ctx } = line([station('st_A', [18, 19, 20], { dwellSeconds: 10 })]);
    const start = withTrain(state, ctx, at(5, 25), []);
    const arrived = advance(start, ctx, 71).state;
    expect(only(arrived).status).toBe('loading');
    const used = arrived.run.fuelUsedTotal;
    const waited = advance(arrived, ctx, 100).state; // 5 s idle × 0.05/s
    expect(waited.run.fuelUsedTotal - used).toBeCloseTo(0.25, 6);
  });
});

describe('Feature: Objectives and scoring', () => {
  const tiers = [
    { stars: 3, maxSeconds: 180, maxFuel: 300, maxBuildCost: 1200 },
    { stars: 2, maxSeconds: 300, maxFuel: 450, maxBuildCost: 1800 },
    { stars: 1 },
  ];

  it('Scenario: Compute stars including build cost', () => {
    expect(starsFor({ seconds: 170, fuelUsed: 290, buildCost: 1300 }, tiers)).toBe(2);
    expect(starsFor({ seconds: 170, fuelUsed: 290, buildCost: 1100 }, tiers)).toBe(3);
    expect(starsFor({ seconds: 900, fuelUsed: 9000, buildCost: 9000 }, tiers)).toBe(1);
    expect(
      starsFor({ seconds: 900, fuelUsed: 0, buildCost: 0 }, [{ stars: 3, maxSeconds: 10 }]),
    ).toBe(0);
  });

  it('Scenario: Complete a level', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18, 19, 20], {
          supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 50 }],
        }),
        station('st_B', [3, 4, 5], { demands: [{ cargo: 'coal' }] }),
      ],
      {
        objectives: [{ id: 'o1', type: 'deliver', cargo: 'coal', amount: 50, to: 'st_B' }],
        scoring: { stars: tiers },
      },
    );
    const start = withTrain(state, ctx, at(5, 25), ['wagon_hopper', 'wagon_hopper']);
    const { state: done, events } = advance(start, ctx, 2000);
    expect(events).toContainEqual({ type: 'level_completed' });
    expect(done.run.outcome).toMatchObject({ kind: 'completed', stars: 3 });
    expect(done.run.outcome?.kind === 'completed' && done.run.outcome.score).toBe(
      (moneyOf(done) ?? 0) - 1000,
    );
    // The simulation stops when the level ends.
    expect(advance(done, ctx, 100).state).toBe(done);
    const objective = ctx.objectives[0];
    expect(objective && objectiveProgress(done, objective)).toBe(50);
  });

  it('levels without objectives never end', () => {
    const { state, ctx } = line([]);
    expect(evaluateOutcome(state, ctx)).toBeNull();
  });
});

describe('Feature: The level is lost when objectives become unreachable', () => {
  const deliver = (amount: number) => [
    { id: 'o1', type: 'deliver' as const, cargo: 'coal', amount, to: 'st_B' },
  ];

  it('Scenario: Exceed the time limit', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18], {
          supplies: [{ cargo: 'coal', ratePerMinute: 60, capacity: 100, initial: 0 }],
        }),
        station('st_B', [3], { demands: [{ cargo: 'coal' }] }),
      ],
      {
        objectives: deliver(50),
        constraints: { timeLimitSeconds: 60 },
        economy: { initialMoney: 5000, fuelPrice: 0.5 },
      },
    );
    const start = withTrain(state, ctx, at(5, 25), ['wagon_hopper']);
    const { state: after, events } = advance(start, ctx, 5000);
    expect(after.run.outcome).toEqual({ kind: 'failed', reason: 'Time is up' });
    expect(after.elapsedTicks).toBe(1200);
    expect(events).toContainEqual({ type: 'level_failed', reason: 'Time is up' });
  });

  it('Scenario: Cargo can no longer be delivered', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18], {
          supplies: [{ cargo: 'coal', ratePerMinute: 0, capacity: 100, initial: 20 }],
        }),
        station('st_B', [3], { demands: [{ cargo: 'coal' }] }),
      ],
      { objectives: deliver(50) },
    );
    const after = advance(enterRunMode(state), ctx, 1).state;
    expect(after.run.outcome).toEqual({ kind: 'failed', reason: 'Not enough coal left' });
  });

  it('Scenario: Crash without money to recover (no trains, not enough money)', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18], {
          supplies: [{ cargo: 'coal', ratePerMinute: 10, capacity: 100, initial: 20 }],
        }),
        station('st_B', [3], { demands: [{ cargo: 'coal' }] }),
      ],
      { objectives: deliver(50), economy: { initialMoney: 100, fuelPrice: 0.5 } },
    );
    // Cheapest: steam 300 + 250 fuel + hopper 70 (the cheapest coal wagon).
    expect(minRecoveryCost(state, ctx)).toBe(620);
    const after = advance(enterRunMode(state), ctx, 1).state;
    expect(after.run.outcome).toEqual({ kind: 'failed', reason: 'No trains and not enough money' });
  });

  it('Scenario: Scrap value counts towards recovery', () => {
    const { state, ctx } = line(
      [
        station('st_A', [18], {
          supplies: [{ cargo: 'coal', ratePerMinute: 10, capacity: 100, initial: 20 }],
        }),
        station('st_B', [3], { demands: [{ cargo: 'coal' }] }),
      ],
      { objectives: deliver(50), economy: { initialMoney: 1000, fuelPrice: 0.5 } },
    );
    const start = withTrain(state, ctx, at(5, 25), ['wagon_hopper']); // money left: 380
    const stranded = {
      ...start,
      trains: start.trains.map((t) => ({ ...t, fuel: 0, status: 'out_of_fuel' as const })),
    };
    // 380 + scrap (370 × 0.5 = 185) = 565 < 620
    expect(bankrupt(stranded, ctx)).toBe('No trains and not enough money');
    const richer = { ...stranded, initialMoney: 1100 }; // 480 + 185 = 665 ≥ 620
    expect(bankrupt(richer, ctx)).toBeNull();
    expect(bankrupt(start, ctx)).toBeNull(); // an operational train
    expect(bankrupt({ ...stranded, initialMoney: null }, ctx)).toBeNull(); // unlimited money
  });
});
