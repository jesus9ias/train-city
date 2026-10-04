/**
 * Golden runs (spec.md §10.3): every tutorial level is solved with a fixed layout built through
 * real editor actions, then simulated. If a level or the rules change and a level becomes
 * unwinnable, this fails.
 */
import { describe, expect, it } from 'vitest';
import { TICK_SECONDS } from '../core/constants';
import { applyAction, type EditorAction } from '../core/editor/actions';
import { createGameState, moneyOf, rulesContext, type GameState } from '../core/game/state';
import type { Port } from '../core/grid/ports';
import { hashString } from '../core/grid/variant';
import { enterRunMode, setTrainRunning } from '../core/sim/commands';
import { advance } from '../core/sim/step';
import { loadLevel } from '../data/loader';
import { testCatalogs } from './fixtures';

type Track = readonly [x: number, y: number, piece: string, rotation: number];

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const row = (y: number, xs: number[]): Track[] => xs.map((x) => [x, y, 'straight', 90]);
const column = (x: number, ys: number[]): Track[] => ys.map((y) => [x, y, 'straight', 0]);

type Train = { cell: [number, number]; facing: Port; locomotive: string; wagons: string[] };
type Solution = { tracks: Track[]; trains: Train[] };

const SOLUTIONS: Record<string, Solution> = {
  // Mine (10,8–10) → south → east along y=38 → Power Plant (40–42,38).
  'level-001': {
    tracks: [...column(10, range(11, 37)), [10, 38, 'curve', 270], ...row(38, range(11, 39))],
    trains: [
      {
        cell: [10, 10],
        facing: 'S',
        locomotive: 'loco_steam',
        wagons: ['wagon_hopper', 'wagon_hopper'],
      },
    ],
  },
  // A clockwise loop around the lake through both towns.
  'level-002': {
    tracks: [
      [8, 10, 'curve', 0],
      [41, 10, 'curve', 90],
      [41, 32, 'curve', 180],
      [8, 32, 'curve', 270],
      ...row(10, range(9, 40)),
      ...row(32, range(9, 40)),
      ...column(8, [...range(11, 19), ...range(23, 31)]),
      ...column(41, [...range(11, 19), ...range(23, 31)]),
    ],
    trains: [
      {
        cell: [8, 20],
        facing: 'N',
        locomotive: 'loco_diesel',
        wagons: ['wagon_pax', 'wagon_pax'],
      },
    ],
  },
  // One line, a reversing loop (switch + 5 cells) at each dead end.
  'level-003': {
    tracks: [
      [7, 25, 'straight', 90],
      ...row(25, range(11, 31)),
      [35, 25, 'straight', 90],
      // West turning loop: switch trunk E, branches W and N.
      [6, 25, 'switch', 270],
      [5, 25, 'curve', 270],
      [5, 24, 'straight', 0],
      [5, 23, 'curve', 0],
      [6, 23, 'curve', 90],
      [6, 24, 'straight', 0],
      // East turning loop: switch trunk W, branches E and S.
      [36, 25, 'switch', 90],
      [37, 25, 'curve', 90],
      [37, 26, 'straight', 0],
      [37, 27, 'curve', 180],
      [36, 27, 'curve', 270],
      [36, 26, 'straight', 0],
    ],
    trains: [
      {
        cell: [8, 25],
        facing: 'W',
        locomotive: 'loco_steam',
        wagons: ['wagon_hopper', 'wagon_hopper', 'wagon_hopper'],
      },
    ],
  },
  // Two trains on lines that meet at a 45° crossing: coal east along y=30, passengers down
  // a diagonal from Northfield to Southgate.
  'level-004': {
    tracks: [
      ...row(30, [...range(9, 36), 38, 39]),
      [37, 30, 'cross45', 90],
      [14, 7, 'curve45', 315],
      ...range(15, 38)
        .filter((x) => x !== 37)
        .map((x): Track => [x, x - 7, 'straight', 135]),
      [39, 32, 'curve45', 135],
      ...column(39, range(33, 39)),
    ],
    trains: [
      {
        cell: [8, 30],
        facing: 'E',
        locomotive: 'loco_steam',
        wagons: ['wagon_hopper', 'wagon_hopper'],
      },
      {
        cell: [14, 6],
        facing: 'S',
        locomotive: 'loco_steam',
        wagons: ['wagon_pax', 'wagon_pax'],
      },
    ],
  },
};

async function play(levelId: string): Promise<GameState> {
  const level = await loadLevel(levelId, testCatalogs);
  const ctx = rulesContext(level, testCatalogs);
  const solution = SOLUTIONS[levelId];
  if (!solution) throw new Error(`no solution for ${levelId}`);
  const actions: EditorAction[] = [
    ...solution.tracks.map(([x, y, piece, rotation]): EditorAction => ({
      type: 'placeTrack',
      cell: { x, y },
      piece,
      rotation,
    })),
    ...solution.trains.map((train): EditorAction => ({
      type: 'placeTrain',
      cell: { x: train.cell[0], y: train.cell[1] },
      locomotive: train.locomotive,
      wagons: train.wagons,
      facing: train.facing,
    })),
  ];
  let game = createGameState(level, testCatalogs);
  for (const action of actions) {
    const outcome = applyAction(game, ctx, action);
    if (!outcome.ok) throw new Error(`${JSON.stringify(action)}: ${outcome.reason}`);
    game = outcome.state;
  }
  let running = enterRunMode(game);
  for (const train of running.trains) {
    const started = setTrainRunning(running, train.id, true);
    if (!started.ok) throw new Error(started.reason);
    running = started.state;
  }
  const limit = level.constraints.timeLimitSeconds ?? 900;
  return advance(running, ctx, Math.ceil(limit / TICK_SECONDS) + 1).state;
}

describe('golden runs: every tutorial level can be won', () => {
  it.each(Object.keys(SOLUTIONS))('%s is completed by its reference solution', async (levelId) => {
    const done = await play(levelId);
    const outcome = done.run.outcome;
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ kind: 'completed' });
    expect(outcome?.kind === 'completed' && outcome.stars).toBeGreaterThanOrEqual(2);
    expect(moneyOf(done)).toBeGreaterThan(0);
    // No train was lost on the way (e.g. where two lines cross).
    expect(done.trains).toHaveLength(SOLUTIONS[levelId]?.trains.length ?? 0);
    // A good solution should pay for itself: tutorials reward efficient play with profit.
    expect(outcome?.kind === 'completed' && outcome.score).toBeGreaterThan(0);
  });

  it('runs are deterministic (same state hash every time)', async () => {
    const a = await play('level-003');
    const b = await play('level-003');
    expect(hashString(JSON.stringify(a))).toBe(hashString(JSON.stringify(b)));
  });
});
