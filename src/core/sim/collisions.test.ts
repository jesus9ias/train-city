import { describe, expect, it } from 'vitest';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { LevelInput } from '../../data/schemas/level';
import { makeGame, makeLevel, testCatalogs } from '../../test/fixtures';
import { applyAction } from '../editor/actions';
import { moneyOf, type GameState, type RulesContext } from '../game/state';
import type { Port } from '../grid/ports';
import { findCollisions, hasOverlap } from './collisions';
import { enterEditorMode, enterRunMode, setTrainRunning } from './commands';
import { advance, type SimEvent } from './step';

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

/** An east-west line y=5, x=0..30, with a coal mine at x=29 and a power plant at x=1. */
function singleTrack(extra: Partial<LevelInput> = {}) {
  const platforms = new Set([1, 29]);
  const tracks: TrackInput[] = Array.from({ length: 31 }, (_, x) => ({
    at: at(x, 5),
    piece: platforms.has(x) ? 'station_track' : 'straight',
    rotation: 90,
  }));
  const stations: StationInput[] = [
    {
      id: 'st_A',
      name: 'Mine',
      cells: [at(29, 5)],
      dwellSeconds: 1,
      supplies: [{ cargo: 'coal', ratePerMinute: 10, capacity: 100, initial: 0 }],
    },
    { id: 'st_B', name: 'Plant', cells: [at(1, 5)], dwellSeconds: 1, demands: [{ cargo: 'coal' }] },
  ];
  const { state, ctx } = makeGame(
    makeLevel(
      { tracks, stations },
      {
        objectives: [{ id: 'o1', type: 'deliver', cargo: 'coal', amount: 50, to: 'st_B' }],
        ...extra,
      },
    ),
  );
  return { state, ctx: { ...ctx, catalogs: instant } };
}

/** A plus-shaped layout: lines y=10 and x=10 meeting at an X crossing on (10,10). */
function crossing() {
  const tracks: TrackInput[] = [];
  for (let i = 0; i <= 20; i++) {
    if (i === 10) continue;
    tracks.push({ at: at(i, 10), piece: 'straight', rotation: 90 });
    tracks.push({ at: at(10, i), piece: 'straight', rotation: 0 });
  }
  tracks.push({ at: at(10, 10), piece: 'cross', rotation: 0 });
  const { state, ctx } = makeGame(
    makeLevel({ tracks }, { economy: { initialMoney: null, fuelPrice: 0.5 } }),
  );
  return { state, ctx: { ...ctx, catalogs: instant } };
}

function buy(
  state: GameState,
  ctx: RulesContext,
  cell: { x: number; y: number },
  facing: Port,
  wagons: string[] = [],
): GameState {
  const outcome = applyAction(state, ctx, {
    type: 'placeTrain',
    cell,
    locomotive: 'loco_steam',
    wagons,
    facing,
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.state;
}

/** Fills every wagon of every train with `amount` of coal. */
function loadCoal(state: GameState, amount: number): GameState {
  return {
    ...state,
    trains: state.trains.map((t) => ({
      ...t,
      wagons: t.wagons.map((w) => ({ ...w, cargo: 'coal', amount })),
    })),
  };
}

function start(state: GameState, ids: string[] = state.trains.map((t) => t.id)): GameState {
  let next = enterRunMode(state);
  for (const id of ids) {
    const outcome = setTrainRunning(next, id, true);
    if (!outcome.ok) throw new Error(outcome.reason);
    next = outcome.state;
  }
  return next;
}

const crashes = (events: readonly SimEvent[]) =>
  events.filter(
    (e): e is Extract<SimEvent, { type: 'train_crashed' }> => e.type === 'train_crashed',
  );

describe('Feature: Collisions', () => {
  it('Scenario: Two trains in the same cell are destroyed', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    let game = buy(state, ctx, at(10, 5), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(18, 5), 'W', ['wagon_hopper']);
    game = loadCoal(game, 20);

    const { state: after, events } = advance(start(game), ctx, 200);
    expect(after.trains).toEqual([]);
    expect(after.run.lost).toEqual({ coal: 40 });
    expect(after.run.outcome).toBeNull(); // the level keeps running
    const [crash] = crashes(events);
    expect(crash?.trains.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(crash?.lost).toEqual({ coal: 40 });
    expect(crash?.cell.y).toBe(5);
    expect(crashes(events)).toHaveLength(1);
  });

  it('two locomotives swapping cells head-on in one tick crash', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    // Adjacent and symmetric: both cross the shared edge on the same tick.
    let game = buy(state, ctx, at(10, 5), 'E');
    game = buy(game, ctx, at(11, 5), 'W');
    const { state: after, events } = advance(start(game), ctx, 40);
    expect(after.trains).toEqual([]);
    expect(crashes(events)).toHaveLength(1);
    expect(after.run.lost).toEqual({});
  });

  it('a running train hits a stopped one', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    let game = buy(state, ctx, at(8, 5), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(14, 5), 'E', ['wagon_hopper']);
    const { state: after, events } = advance(start(game, ['t1']), ctx, 200);
    expect(after.trains).toEqual([]);
    expect(crashes(events)).toHaveLength(1);
  });

  it('trains following each other at the same speed never collide', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    // Bumper to bumper: the follower enters each cell on the tick the leader leaves it.
    let game = buy(state, ctx, at(4, 5), 'E');
    game = buy(game, ctx, at(5, 5), 'E');
    const { state: after, events } = advance(start(game), ctx, 100);
    expect(crashes(events)).toEqual([]);
    expect(after.trains.map((t) => t.head.cell.x)).toEqual([14, 15]);
  });

  it('Scenario: X crossing without collision', () => {
    const { state, ctx } = crossing();
    // Different ticks: the southbound train reaches the crossing long after the eastbound one.
    let game = buy(state, ctx, at(6, 10), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(10, 1), 'S', ['wagon_hopper']);
    const { state: after, events } = advance(start(game), ctx, 200);
    expect(crashes(events)).toEqual([]);
    expect(after.trains).toHaveLength(2);
  });

  it('two trains on different routes of an X crossing at the same time do not crash', () => {
    const { state, ctx } = crossing();
    // Mirror images: both locomotives sit on the crossing on the same ticks.
    let game = buy(state, ctx, at(7, 10), 'E');
    game = buy(game, ctx, at(10, 7), 'S');
    const { state: after, events } = advance(start(game), ctx, 100);
    expect(crashes(events)).toEqual([]);
    expect(after.trains).toHaveLength(2);
  });

  it('two trains on the same route of an X crossing crash', () => {
    const { state, ctx } = crossing();
    let game = buy(state, ctx, at(7, 10), 'E');
    game = buy(game, ctx, at(13, 10), 'W');
    const { state: after, events } = advance(start(game), ctx, 100);
    expect(crashes(events)).toHaveLength(1);
    expect(after.trains).toEqual([]);
  });

  it('only the trains involved are destroyed', () => {
    const { state, ctx } = crossing();
    let game = buy(state, ctx, at(7, 10), 'E');
    game = buy(game, ctx, at(13, 10), 'W');
    game = buy(game, ctx, at(10, 2), 'N'); // heading away from the crash
    const { state: after } = advance(start(game), ctx, 100);
    expect(after.trains.map((t) => t.id)).toEqual(['t3']);
  });

  it('crashes are deterministic and never leave two trains on one cell', () => {
    const { state, ctx } = crossing();
    let game = buy(state, ctx, at(5, 10), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(10, 4), 'S', ['wagon_hopper', 'wagon_hopper']);
    game = buy(game, ctx, at(16, 10), 'W');
    game = start(game);
    let a = game;
    let b = game;
    for (let i = 0; i < 150; i++) {
      a = advance(a, ctx, 1).state;
      b = advance(b, ctx, 1).state;
      expect(hasOverlap(a.trains)).toBe(false);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('findCollisions ignores trains that do not touch', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    let game = buy(state, ctx, at(4, 5), 'E');
    game = buy(game, ctx, at(20, 5), 'W');
    expect(findCollisions(game.trains, game.trains)).toEqual([]);
    expect(findCollisions([], game.trains)).toEqual([]); // trains placed during the tick
  });
});

describe('Feature: Losing trains and recovering', () => {
  it('Scenario: Crash with enough money to recover', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 5000, fuelPrice: 0.5 } });
    let game = buy(state, ctx, at(10, 5), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(18, 5), 'W', ['wagon_hopper']);
    const after = advance(start(game), ctx, 200).state;
    expect(after.trains).toEqual([]);
    expect(after.run.outcome).toBeNull();
    expect(moneyOf(after)).toBe(3760);

    // Switch to Editor Mode and buy a replacement.
    const editing = enterEditorMode(after);
    const replaced = buy(editing, ctx, at(10, 5), 'E', ['wagon_hopper']);
    expect(replaced.trains.map((t) => t.id)).toEqual(['t3']);
    expect(moneyOf(replaced)).toBe(3140);
  });

  it('Scenario: Crash without money to recover', () => {
    const { state, ctx } = singleTrack({ economy: { initialMoney: 1500, fuelPrice: 0.5 } });
    let game = buy(state, ctx, at(10, 5), 'E', ['wagon_hopper']);
    game = buy(game, ctx, at(18, 5), 'W', ['wagon_hopper']);
    expect(moneyOf(game)).toBe(260); // less than a steam train with a full tank and a hopper
    const { state: after, events } = advance(start(game), ctx, 200);
    expect(after.trains).toEqual([]);
    expect(after.run.outcome).toEqual({ kind: 'failed', reason: 'No trains and not enough money' });
    expect(events.at(-1)).toEqual({
      type: 'level_failed',
      reason: 'No trains and not enough money',
    });
  });

  it('respects maxTrains when buying replacements', () => {
    const { state, ctx } = singleTrack({
      economy: { initialMoney: 5000, fuelPrice: 0.5 },
      editorRules: { allowTerrainEdit: false, allowObjectEdit: false, maxTrains: 2 },
    });
    let game = buy(state, ctx, at(10, 5), 'E');
    game = buy(game, ctx, at(18, 5), 'W');
    const full = applyAction(game, ctx, {
      type: 'placeTrain',
      cell: at(4, 5),
      locomotive: 'loco_steam',
      wagons: [],
      facing: 'E',
    });
    expect(full).toMatchObject({ ok: false, reason: 'Train limit reached' });

    // After the crash, the freed slots can be used again.
    const after = enterEditorMode(advance(start(game), ctx, 200).state);
    expect(after.trains).toEqual([]);
    const again = buy(buy(after, ctx, at(4, 5), 'E'), ctx, at(20, 5), 'E');
    expect(again.trains).toHaveLength(2);
  });
});
