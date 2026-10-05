import { describe, expect, it } from 'vitest';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { LevelInput } from '../../data/schemas/level';
import { makeGame, makeLevel, testCatalogs } from '../../test/fixtures';
import { applyAction } from '../editor/actions';
import type { GameState, RulesContext } from '../game/state';
import type { Port } from '../grid/ports';
import { cellKey } from '../world/world';
import { enterRunMode, setTrainRunning } from './commands';
import { blockAhead, protectedExit, signalAspects } from './signals';
import { advance, step } from './step';
import type { TrainState } from './train';

type TrackInput = NonNullable<LevelInput['map']['tracks']>[number];
const at = (x: number, y: number) => ({ x, y });

/** Same catalogs, but locomotives reach full speed instantly. */
const instant: Catalogs = {
  ...testCatalogs,
  locomotives: Object.fromEntries(
    Object.entries(testCatalogs.locomotives).map(([id, l]) => [id, { ...l, acceleration: 1e9 }]),
  ),
};

function game(tracks: TrackInput[]): { state: GameState; ctx: RulesContext } {
  const { state, ctx } = makeGame(
    makeLevel({ tracks }, { economy: { initialMoney: null, fuelPrice: 0.5 } }),
  );
  return { state, ctx: { ...ctx, catalogs: instant } };
}

/** Line y=0, x=0..30, with signals guarding E at (5,0) and (12,0) (the spec's background). */
function line(extra: TrackInput[] = []) {
  const signals = new Set([5, 12]);
  const tracks: TrackInput[] = Array.from({ length: 31 }, (_, x) => ({
    at: at(x, 0),
    piece: signals.has(x) ? 'signal' : 'straight',
    rotation: 90,
  }));
  return game([...tracks, ...extra]);
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

function run(state: GameState, ids: string[]): GameState {
  let next = state.mode === 'running' ? state : enterRunMode(state);
  for (const id of ids) {
    const outcome = setTrainRunning(next, id, true);
    if (!outcome.ok) throw new Error(outcome.reason);
    next = outcome.state;
  }
  return next;
}

const train = (state: GameState, id: string) => state.trains.find((t) => t.id === id) as TrainState;

/** Ticks until `done` holds (or fails after `max` ticks). */
function until(
  state: GameState,
  ctx: RulesContext,
  done: (s: GameState) => boolean,
  max = 2000,
): GameState {
  let current = state;
  for (let i = 0; i < max; i++) {
    if (done(current)) return current;
    current = step(current, ctx).state;
  }
  throw new Error('condition never met');
}

describe('Feature: Signals and blocks', () => {
  it('a signal guards its rotated exit; other pieces guard nothing', () => {
    const signal = testCatalogs.pieces['signal'];
    const straight = testCatalogs.pieces['straight'];
    if (!signal || !straight) throw new Error('missing pieces');
    expect(protectedExit(signal, 0)).toBe('N');
    expect(protectedExit(signal, 90)).toBe('E');
    expect(protectedExit(signal, 225)).toBe('SW');
    expect(protectedExit(straight, 0)).toBeUndefined();
  });

  it('Background: the block ahead runs to the next signal', () => {
    const { state, ctx } = line();
    const block = blockAhead(state.world, ctx.catalogs.pieces, at(5, 0), 'E');
    expect([...block].sort()).toEqual(['6,0', '7,0', '8,0', '9,0', '10,0', '11,0', '12,0'].sort());
  });

  it('Scenario: A signal is green when its block is free', () => {
    const { state, ctx } = line();
    const aspects = signalAspects(state.world, ctx.catalogs.pieces, state.trains);
    expect(aspects.get('5,0')).toBe('green');
    expect(aspects.get('12,0')).toBe('green');
  });

  it('Scenario: A train waits at a red signal and goes on when the block clears', () => {
    const { state, ctx } = line();
    let g = buy(state, ctx, at(2, 0), 'E');
    g = buy(g, ctx, at(9, 0), 'E'); // t2, stopped inside the block
    expect(signalAspects(g.world, ctx.catalogs.pieces, g.trains).get('5,0')).toBe('red');

    g = until(run(g, ['t1']), ctx, (s) => train(s, 't1').status === 'waiting');
    expect(train(g, 't1')).toMatchObject({ status: 'waiting', speed: 0, head: { cell: at(5, 0) } });
    g = advance(g, ctx, 50).state;
    expect(train(g, 't1').head.cell).toEqual(at(5, 0)); // still waiting

    // t2 leaves for the next block; t1 follows and then waits at the next signal.
    g = run(g, ['t2']);
    g = until(g, ctx, (s) => train(s, 't1').head.cell.x > 5);
    g = until(g, ctx, (s) => train(s, 't1').status === 'waiting');
    expect(train(g, 't1').head.cell).toEqual(at(12, 0));
    expect(g.trains).toHaveLength(2);
  });

  it('Scenario: Trains running against a signal pass it', () => {
    const { state, ctx } = line();
    let g = buy(state, ctx, at(8, 0), 'W');
    g = buy(g, ctx, at(1, 0), 'W'); // occupies the block west of (5,0)
    g = run(g, ['t1']);
    const statuses: string[] = [];
    until(g, ctx, (s) => {
      statuses.push(train(s, 't1').status);
      return train(s, 't1').head.cell.x <= 4;
    });
    expect(statuses).not.toContain('waiting');
  });

  it('Scenario: Two trains reaching the same free block in the same tick', () => {
    // Main line y=5 eastbound (signal at x=5); a branch x=10 southbound (signal at y=3) merges
    // into it at a switch on (10,5).
    const tracks: TrackInput[] = [];
    for (let x = 0; x <= 20; x++) {
      if (x === 10) continue;
      tracks.push({ at: at(x, 5), piece: x === 5 ? 'signal' : 'straight', rotation: 90 });
    }
    // Switch with trunk E: straight route E–W, branch E–N.
    tracks.push({ at: at(10, 5), piece: 'switch', rotation: 270 });
    for (let y = 0; y <= 4; y++) {
      tracks.push({
        at: at(10, y),
        piece: y === 3 ? 'signal' : 'straight',
        rotation: y === 3 ? 180 : 0,
      });
    }
    const { state, ctx } = game(tracks);
    // Both locomotives are 2.5 cells from the far edge of their signal.
    let g = buy(state, ctx, at(3, 5), 'E');
    g = buy(g, ctx, at(10, 1), 'S');
    g = run(g, ['t1', 't2']);
    g = until(g, ctx, (s) => s.trains.some((t) => t.status === 'waiting'));
    expect(train(g, 't1').head.cell.x).toBeGreaterThan(5); // t1 entered the merge block
    expect(train(g, 't2')).toMatchObject({ status: 'waiting', head: { cell: at(10, 3) } });
  });

  it('Scenario: Junctions and crossings join their lines into one block', () => {
    const vertical: TrackInput[] = [];
    for (let y = 0; y <= 6; y++) {
      if (y !== 0) vertical.push({ at: at(8, y), piece: 'straight', rotation: 0 });
    }
    const { state, ctx } = line(vertical);
    const tracks = state.world.tracks.map((t) =>
      cellKey(t.at) === '8,0' ? { ...t, piece: 'cross' } : t,
    );
    const crossed = { ...state, world: { ...state.world, tracks } };
    const g = buy(crossed, ctx, at(8, 4), 'S');
    expect(blockAhead(g.world, ctx.catalogs.pieces, at(5, 0), 'E').has('8,4')).toBe(true);
    expect(signalAspects(g.world, ctx.catalogs.pieces, g.trains).get('5,0')).toBe('red');
  });

  it('Scenario: A train never waits for itself', () => {
    // A 4 × 4 ring with a single signal on its north side; the train fills most of it.
    const tracks: TrackInput[] = [
      { at: at(0, 0), piece: 'curve', rotation: 0 },
      { at: at(1, 0), piece: 'signal', rotation: 90 },
      { at: at(2, 0), piece: 'straight', rotation: 90 },
      { at: at(3, 0), piece: 'curve', rotation: 90 },
      { at: at(3, 1), piece: 'straight', rotation: 0 },
      { at: at(3, 2), piece: 'straight', rotation: 0 },
      { at: at(3, 3), piece: 'curve', rotation: 180 },
      { at: at(2, 3), piece: 'straight', rotation: 90 },
      { at: at(1, 3), piece: 'straight', rotation: 90 },
      { at: at(0, 3), piece: 'curve', rotation: 270 },
      { at: at(0, 2), piece: 'straight', rotation: 0 },
      { at: at(0, 1), piece: 'straight', rotation: 0 },
    ];
    const { state, ctx } = game(tracks);
    let g = buy(state, ctx, at(3, 1), 'S', ['wagon_hopper', 'wagon_hopper', 'wagon_hopper']);
    g = run(g, ['t1']);
    const statuses = new Set<string>();
    let laps = 0;
    for (let i = 0; i < 400; i++) {
      const before = train(g, 't1').head.cell;
      g = step(g, ctx).state;
      const after = train(g, 't1').head.cell;
      if (cellKey(after) === '1,0' && cellKey(before) !== '1,0') laps++;
      statuses.add(train(g, 't1').status);
    }
    expect([...statuses]).toEqual(['running']);
    expect(laps).toBeGreaterThanOrEqual(2);
  });
});
