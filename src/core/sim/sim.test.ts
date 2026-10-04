import { describe, expect, it } from 'vitest';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { LevelInput } from '../../data/schemas/level';
import { makeGame, makeLevel, testCatalogs } from '../../test/fixtures';
import { applyAction, REASONS, type EditorAction } from '../editor/actions';
import { moneyOf, type GameState, type RulesContext } from '../game/state';
import { hashString } from '../grid/variant';
import { trackAt } from '../world/world';
import {
  enterEditorMode,
  enterRunMode,
  flipSwitch,
  RUN_REASONS,
  setPaused,
  setTrainRunning,
} from './commands';
import { facingFromRotation, layoutTrain, occupiedCells, TRAIN_DOES_NOT_FIT } from './placement';
import { entryFor, exitFor } from './routing';
import { advance, step } from './step';
import { trainCells, type TrainState } from './train';

type TrackInput = NonNullable<LevelInput['map']['tracks']>[number];
const at = (x: number, y: number) => ({ x, y });
const t = (x: number, y: number, piece: string, rotation = 0, state?: number): TrackInput => ({
  at: at(x, y),
  piece,
  rotation,
  ...(state === undefined ? {} : { state }),
});
const vertical = (x: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => t(x, from + i, 'straight', 0));
const horizontal = (y: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => t(from + i, y, 'straight', 90));

/** Same catalogs, but locomotives reach full speed instantly. */
const instant: Catalogs = {
  ...testCatalogs,
  locomotives: Object.fromEntries(
    Object.entries(testCatalogs.locomotives).map(([id, l]) => [id, { ...l, acceleration: 1e9 }]),
  ),
};

function game(tracks: TrackInput[], catalogs: Catalogs = instant, extra: Partial<LevelInput> = {}) {
  const { state, ctx } = makeGame(makeLevel({ tracks }, extra));
  return { state, ctx: { ...ctx, catalogs } };
}

function run(state: GameState, ctx: RulesContext, action: EditorAction): GameState {
  const outcome = applyAction(state, ctx, action);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.state;
}

function placeTrain(
  state: GameState,
  ctx: RulesContext,
  cell: { x: number; y: number },
  facing: 'N' | 'E' | 'S' | 'W',
  wagons: string[] = [],
) {
  return run(state, ctx, { type: 'placeTrain', cell, locomotive: 'loco_steam', wagons, facing });
}

function startAll(state: GameState): GameState {
  let next = enterRunMode(state);
  for (const train of next.trains) {
    const outcome = setTrainRunning(next, train.id, true);
    if (outcome.ok) next = outcome.state;
  }
  return next;
}

const only = (state: GameState): TrainState => {
  const [train] = state.trains;
  if (!train) throw new Error('no train');
  return train;
};

describe('routing', () => {
  const pieces = testCatalogs.pieces;
  const piece = (id: string) => {
    const def = pieces[id];
    if (!def) throw new Error(id);
    return def;
  };

  it('follows simple pieces in both directions', () => {
    expect(exitFor(piece('straight'), 0, 0, 'S')).toBe('N');
    expect(exitFor(piece('straight'), 0, 0, 'N')).toBe('S');
    expect(exitFor(piece('curve'), 0, 0, 'S')).toBe('E');
    expect(exitFor(piece('straight'), 0, 0, 'E')).toBeUndefined();
    expect(exitFor(piece('buffer'), 0, 0, 'S')).toBeNull();
  });

  it('Scenario: Entering from the trunk follows the active state', () => {
    expect(exitFor(piece('switch'), 0, 1, 'S')).toBe('E');
    expect(exitFor(piece('switch'), 0, 0, 'S')).toBe('N');
    expect(exitFor(piece('wye'), 0, 0, 'S')).toBe('W');
  });

  it('Scenario: Trailing through a switch', () => {
    expect(exitFor(piece('switch'), 0, 0, 'E')).toBe('S');
    expect(exitFor(piece('switch'), 0, 1, 'N')).toBe('S');
  });

  it('Scenario: Traverse an X crossing', () => {
    expect(exitFor(piece('cross'), 0, 0, 'W')).toBe('E');
    expect(exitFor(piece('cross'), 0, 0, 'N')).toBe('S');
  });

  it('finds where a train came from (to lay wagons)', () => {
    expect(entryFor(piece('straight'), 90, 0, 'E')).toBe('W');
    expect(entryFor(piece('switch'), 0, 0, 'S')).toBe('N');
    expect(entryFor(piece('switch'), 0, 0, 'E')).toBeUndefined(); // state 0 never leaves via E
    expect(entryFor(piece('switch'), 0, 1, 'E')).toBe('S');
    expect(entryFor(piece('buffer'), 0, 0, 'S')).toBeUndefined();
  });

  it('maps editor rotations to facings', () => {
    expect([0, 90, 180, 270].map(facingFromRotation)).toEqual(['N', 'E', 'S', 'W']);
  });
});

describe('Feature: Train movement', () => {
  it('Scenario: Place a train with wagons', () => {
    const { state, ctx } = game(vertical(5, 10, 14));
    const placed = placeTrain(state, ctx, at(5, 10), 'N', ['wagon_hopper', 'wagon_hopper']);
    expect(trainCells(only(placed))).toEqual([at(5, 10), at(5, 11), at(5, 12)]);
    expect(only(placed)).toMatchObject({ status: 'stopped', running: false, fuel: 500 });
  });

  it('Scenario: Train does not fit', () => {
    const { state, ctx } = game(vertical(5, 10, 11));
    const outcome = applyAction(state, ctx, {
      type: 'placeTrain',
      cell: at(5, 10),
      locomotive: 'loco_steam',
      wagons: ['wagon_hopper', 'wagon_hopper'],
      facing: 'N',
    });
    expect(outcome).toMatchObject({ ok: false, reason: TRAIN_DOES_NOT_FIT });
  });

  it('chooses another facing when the preferred one does not fit the track', () => {
    const { state, ctx } = game(vertical(5, 10, 14));
    const placed = placeTrain(state, ctx, at(5, 12), 'E');
    expect(only(placed).head.exit).toBe('S');
  });

  it('Scenario: Train moves according to its speed', () => {
    const { state, ctx } = game(vertical(5, 0, 20));
    const placed = placeTrain(state, ctx, at(5, 15), 'N');
    const before = only(placed);
    const after = only(advance(startAll(placed), ctx, 20).state); // 20 ticks = 1 second
    const distance = before.head.cell.y - after.head.cell.y + (after.progress - before.progress);
    expect(distance).toBeCloseTo(2, 6);
    expect(after.status).toBe('running');
  });

  it('Scenario: Trains never reverse', () => {
    const { state, ctx } = game([t(5, 5, 'buffer', 0), ...vertical(5, 6, 9)]); // connects S
    const placed = startAll(placeTrain(state, ctx, at(5, 8), 'N'));
    const { state: stopped, events } = advance(placed, ctx, 100);
    expect(only(stopped)).toMatchObject({ status: 'blocked', speed: 0, head: { cell: at(5, 5) } });
    expect(events).toEqual([{ type: 'train_blocked', trainId: 't1' }]);

    // Pressing start again changes nothing.
    const again = setTrainRunning(stopped, 't1', true);
    const later = only(advance(again.ok ? again.state : stopped, ctx, 100).state);
    expect(later).toMatchObject({ status: 'blocked', head: { cell: at(5, 5) } });
  });

  it('Scenario: End of track without a buffer stop', () => {
    const { state, ctx } = game(vertical(5, 6, 9));
    const after = only(advance(startAll(placeTrain(state, ctx, at(5, 8), 'N')), ctx, 100).state);
    expect(after).toMatchObject({ status: 'blocked', head: { cell: at(5, 6) } });
  });

  it('derails when the next piece has no matching route', () => {
    const { state, ctx } = game([t(5, 5, 'straight', 90), ...vertical(5, 6, 9)]);
    const { state: after, events } = advance(
      startAll(placeTrain(state, ctx, at(5, 8), 'N')),
      ctx,
      100,
    );
    expect(only(after).status).toBe('derailed');
    expect(events).toEqual([{ type: 'train_derailed', trainId: 't1' }]);
  });

  it('a blocked train continues once the track is extended', () => {
    const { state, ctx } = game(vertical(5, 6, 9));
    const blocked = advance(startAll(placeTrain(state, ctx, at(5, 8), 'N')), ctx, 60).state;
    const editing = enterEditorMode(blocked);
    const extended = enterRunMode(
      run(editing, ctx, { type: 'placeTrack', cell: at(5, 5), piece: 'straight', rotation: 0 }),
    );
    const after = only(advance(extended, ctx, 10).state);
    expect(after.status).toBe('running');
    expect(after.head.cell).toEqual(at(5, 5));
  });

  it('stopping a train decelerates it to a halt', () => {
    const slow = testCatalogs; // real acceleration: 0.5 cells/s²
    const { state, ctx } = game(vertical(5, 0, 40), slow);
    const moving = advance(startAll(placeTrain(state, ctx, at(5, 38), 'N')), ctx, 40).state;
    expect(only(moving).speed).toBeCloseTo(1, 6);
    const stopping = setTrainRunning(moving, 't1', false);
    const stopped = only(advance(stopping.ok ? stopping.state : moving, ctx, 60).state);
    expect(stopped).toMatchObject({ speed: 0, status: 'stopped' });
  });

  it('wagons follow the locomotive cell by cell', () => {
    const { state, ctx } = game(vertical(5, 0, 20));
    const placed = startAll(placeTrain(state, ctx, at(5, 15), 'N', ['wagon_hopper', 'wagon_box']));
    const after = only(advance(placed, ctx, 30).state);
    const cells = trainCells(after);
    expect(cells[1]).toEqual({ x: 5, y: (cells[0]?.y ?? 0) + 1 });
    expect(cells[2]).toEqual({ x: 5, y: (cells[0]?.y ?? 0) + 2 });
  });

  it('terrain slows trains down', () => {
    const tracks = vertical(5, 0, 30);
    const { state, ctx } = game(tracks);
    const snowy = makeGame(
      makeLevel({
        tracks,
        terrainPatches: [{ terrain: 'snow', rect: { x: 0, y: 0, w: 50, h: 50 } }],
      }),
    );
    const fast = only(advance(startAll(placeTrain(state, ctx, at(5, 25), 'N')), ctx, 60).state);
    const snowCtx = { ...snowy.ctx, catalogs: instant };
    const slow = only(
      advance(startAll(placeTrain(snowy.state, snowCtx, at(5, 25), 'N')), snowCtx, 60).state,
    );
    expect(slow.head.cell.y).toBeGreaterThan(fast.head.cell.y);
  });
});

describe('Feature: Switches and wyes — Scenario: Reversing loop turns a train around', () => {
  // Main line going north into a switch (trunk S); its branches N and E are joined by a loop.
  const loop: TrackInput[] = [
    t(5, 17, 'buffer', 180),
    ...vertical(5, 10, 16),
    t(5, 9, 'switch', 0, 0),
    t(5, 8, 'straight', 0),
    t(5, 7, 'curve', 0), // S-E
    t(6, 7, 'straight', 90),
    t(7, 7, 'curve', 90), // W-S
    t(7, 8, 'straight', 0),
    t(7, 9, 'curve', 180), // N-W
    t(6, 9, 'straight', 90),
  ];

  it('the train comes back through the trunk heading south', () => {
    const { state, ctx } = game(loop);
    let current = startAll(placeTrain(state, ctx, at(5, 12), 'N', ['wagon_hopper']));
    const visits: string[] = [];
    for (let i = 0; i < 400; i++) {
      current = step(current, ctx).state;
      const head = only(current).head;
      const key = `${head.cell.x},${head.cell.y}:${head.entry}`;
      if (visits.at(-1) !== key) visits.push(key);
    }
    expect(visits).toContain('5,9:S'); // entered the switch from the trunk
    expect(visits).toContain('5,9:E'); // came back through the branch (trailing move)
    expect(only(current)).toMatchObject({
      status: 'blocked',
      head: { cell: at(5, 17), entry: 'N' },
    });
  });
});

describe('Feature: Switches and wyes — run-mode flipping', () => {
  it('Scenario: Flip a switch in Run Mode', () => {
    const { state, ctx } = game([t(5, 9, 'switch', 0, 0)]);
    const flipped = flipSwitch(enterRunMode(state), ctx, at(5, 9));
    expect(flipped.ok && trackAt(flipped.state.world, at(5, 9))?.state).toBe(1);
    const back = flipped.ok ? flipSwitch(flipped.state, ctx, at(5, 9)) : flipped;
    expect(back.ok && trackAt(back.state.world, at(5, 9))?.state).toBe(0);
  });

  it('Scenario: Cannot flip an occupied switch', () => {
    const { state, ctx } = game([
      ...vertical(5, 10, 12),
      t(5, 9, 'switch', 0, 0),
      t(5, 8, 'straight'),
    ]);
    const placed = placeTrain(state, ctx, at(5, 9), 'N', ['wagon_hopper']);
    expect(flipSwitch(placed, ctx, at(5, 9))).toEqual({
      ok: false,
      reason: RUN_REASONS.switchOccupied,
    });
    expect(flipSwitch(placed, ctx, at(5, 11))).toEqual({
      ok: false,
      reason: RUN_REASONS.notASwitch,
    });
  });

  it('unknown trains cannot be started', () => {
    const { state } = game([]);
    expect(setTrainRunning(state, 'nope', true)).toEqual({
      ok: false,
      reason: RUN_REASONS.noTrain,
    });
  });
});

describe('Feature: Switching between modes', () => {
  it('Scenario: Editing is disabled in Run Mode', () => {
    const { state, ctx } = game(vertical(5, 0, 5));
    const running = enterRunMode(state);
    const outcome = applyAction(running, ctx, {
      type: 'placeTrack',
      cell: at(9, 9),
      piece: 'straight',
      rotation: 0,
    });
    expect(outcome).toMatchObject({ ok: false, reason: REASONS.notInEditor });
  });

  it('Scenario: Editor Mode pauses and keeps the run state', () => {
    const { state, ctx } = game(vertical(5, 0, 30));
    const moving = advance(startAll(placeTrain(state, ctx, at(5, 25), 'N')), ctx, 40).state;
    const editing = enterEditorMode(moving);
    expect(editing.elapsedTicks).toBe(40);
    expect(editing.trains).toBe(moving.trains);
    expect(enterRunMode(editing).trains).toBe(moving.trains);
    expect(enterEditorMode(editing)).toBe(editing);
  });

  it('Scenario: Cannot edit under a train', () => {
    const { state, ctx } = game(vertical(5, 5, 8));
    const placed = placeTrain(state, ctx, at(5, 6), 'N');
    expect(applyAction(placed, ctx, { type: 'rotateTrack', cell: at(5, 6) })).toMatchObject({
      ok: false,
      reason: REASONS.trainOccupied,
    });
  });

  it('leaving the editor starts a new editor session; pausing is idempotent', () => {
    const { state } = game([]);
    const running = enterRunMode(state);
    expect(running).toMatchObject({ mode: 'running', paused: false, editorSession: 2 });
    expect(enterRunMode(running)).toBe(running);
    expect(setPaused(running, true).paused).toBe(true);
    expect(setPaused(running, false)).toBe(running);
  });
});

describe('buying and scrapping trains', () => {
  it('charges for the vehicles and a full tank', () => {
    const { state, ctx } = game(vertical(5, 0, 5));
    const placed = placeTrain(state, ctx, at(5, 1), 'N', ['wagon_hopper']);
    // 300 (steam) + 70 (hopper) + 500 fuel × 0.5
    expect(moneyOf(placed)).toBe(1000 - 300 - 70 - 250);
    expect(placed.ledger).toMatchObject({ trains: 370, fuel: 250 });
  });

  it('scrapping refunds everything in the same session, part of the vehicles later', () => {
    const { state, ctx } = game(vertical(5, 0, 5));
    const placed = placeTrain(state, ctx, at(5, 1), 'N', ['wagon_hopper']);
    expect(moneyOf(run(placed, ctx, { type: 'erase', cell: at(5, 2) }))).toBe(1000);
    const later = enterEditorMode(enterRunMode(placed));
    expect(moneyOf(run(later, ctx, { type: 'erase', cell: at(5, 1) }))).toBe(380 + 185);
  });

  it('enforces the level rules', () => {
    const rules = { allowTerrainEdit: true, allowObjectEdit: true, maxTrains: 1 };
    const { state, ctx } = game(vertical(5, 0, 12), instant, {
      editorRules: {
        ...rules,
        allowedLocomotives: ['loco_steam'],
        allowedWagons: ['wagon_hopper'],
      },
    });
    const place = (s: GameState, locomotive: string, wagons: string[], cell = at(5, 3)) =>
      applyAction(s, ctx, { type: 'placeTrain', cell, locomotive, wagons, facing: 'N' });
    expect(place(state, 'loco_diesel', [])).toMatchObject({ reason: REASONS.notAllowed });
    expect(place(state, 'loco_steam', ['wagon_pax'])).toMatchObject({ reason: REASONS.notAllowed });
    expect(place(state, 'loco_steam', Array<string>(6).fill('wagon_hopper'))).toMatchObject({
      reason: REASONS.tooManyWagons,
    });
    const one = place(state, 'loco_steam', []);
    expect(one.ok && place(one.state, 'loco_steam', [], at(5, 9))).toMatchObject({
      reason: REASONS.trainLimit,
    });

    const poor = { ...state, initialMoney: 100 };
    expect(place(poor, 'loco_steam', [])).toMatchObject({ reason: REASONS.noMoney });
  });

  it('trains cannot overlap', () => {
    const { state, ctx } = game(vertical(5, 0, 12));
    const first = placeTrain(state, ctx, at(5, 3), 'N', ['wagon_hopper']);
    const outcome = applyAction(first, ctx, {
      type: 'placeTrain',
      cell: at(5, 4),
      locomotive: 'loco_steam',
      wagons: [],
      facing: 'N',
    });
    expect(outcome).toMatchObject({ reason: REASONS.trainOccupied });
    expect(occupiedCells(first.trains)).toEqual(new Set(['5,3', '5,4']));
  });

  it('layouts reject cells off the track or outside the map', () => {
    const { state } = game(vertical(0, 0, 1));
    expect(layoutTrain(state.world, testCatalogs.pieces, at(0, 0), 'S', 3).ok).toBe(false);
    expect(layoutTrain(state.world, testCatalogs.pieces, at(9, 9), 'N', 0).ok).toBe(false);
    expect(layoutTrain(state.world, testCatalogs.pieces, at(-1, 0), 'N', 0).ok).toBe(false);
  });
});

describe('Feature: Train movement — Scenario: Determinism', () => {
  it('the same layout and seed give the same state hash after 10,000 ticks', () => {
    const loop: TrackInput[] = [
      t(5, 5, 'curve', 0),
      ...horizontal(5, 6, 9),
      t(10, 5, 'curve', 90),
      ...vertical(10, 6, 9),
      t(10, 10, 'curve', 180),
      ...horizontal(10, 6, 9),
      t(5, 10, 'curve', 270),
      ...vertical(5, 6, 9),
    ];
    const runOnce = () => {
      const { state, ctx } = game(loop, testCatalogs);
      const placed = startAll(placeTrain(state, ctx, at(5, 8), 'N', ['wagon_hopper', 'wagon_box']));
      return hashString(JSON.stringify(advance(placed, ctx, 10_000).state));
    };
    expect(runOnce()).toBe(runOnce());
  });
});
