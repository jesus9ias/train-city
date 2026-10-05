import { describe, expect, it } from 'vitest';
import { headingTowards, isLinePiece, pieceForRoute } from '../core/editor/drawLine';
import type { GridPoint } from '../core/editor/drawLine';
import { trackAt } from '../core/world/world';
import type { Level } from '../data/schemas/level';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { createEditorController } from './editorController';
import type { ReadySession } from './gameStore';
import { createAppStores, type AppStores } from './stores';

async function storesWith(level: Level): Promise<AppStores> {
  const stores = createAppStores({
    catalogs: testCatalogs,
    levels: [{ id: level.id, name: level.name, unlocked: true }],
    loadLevel: () => Promise.resolve(level),
  });
  await stores.game.getState().loadLevel(level.id);
  stores.editor.getState().selectTool({ kind: 'track', piece: 'straight' });
  return stores;
}

function ready(stores: AppStores): ReadySession {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('level not ready');
  return session;
}

const at = (x: number, y: number) => ({ x, y });
const center = (x: number, y: number): GridPoint => ({ x: x + 0.5, y: y + 0.5 });

/** Presses on the first point and drags through the rest (pointer positions in cell units). */
function stroke(stores: AppStores, points: GridPoint[]) {
  const controller = createEditorController(stores);
  const [first, ...rest] = points;
  if (!first) return;
  controller.down(at(Math.floor(first.x), Math.floor(first.y)));
  for (const p of rest) controller.drag(at(Math.floor(p.x), Math.floor(p.y)), p);
  controller.up();
}

/** [piece, rotation] at a cell, or null. */
function trackOf(stores: AppStores, x: number, y: number) {
  const track = trackAt(ready(stores).game.world, at(x, y));
  return track ? [track.piece, track.rotation] : null;
}

describe('draw line helpers', () => {
  it('snaps the heading to the nearest of 8 directions', () => {
    const cell = at(5, 5);
    expect(headingTowards(cell, { x: 7, y: 5.5 })).toBe('E');
    expect(headingTowards(cell, { x: 6.6, y: 6.6 })).toBe('SE');
    expect(headingTowards(cell, { x: 5.5, y: 2 })).toBe('N');
    expect(headingTowards(cell, { x: 2, y: 4.8 })).toBe('W'); // 11° above west: still west
    expect(headingTowards(cell, { x: 4.2, y: 4.2 })).toBe('NW');
  });

  it('finds the piece for a route among the allowed ones', () => {
    const { pieces } = testCatalogs;
    expect(pieceForRoute(pieces, undefined, 'W', 'E')).toEqual({ piece: 'straight', rotation: 90 });
    expect(pieceForRoute(pieces, undefined, 'NW', 'SE')).toEqual({
      piece: 'straight',
      rotation: 135,
    });
    expect(pieceForRoute(pieces, undefined, 'W', 'S')?.piece).toBe('curve');
    expect(pieceForRoute(pieces, undefined, 'W', 'SE')).toEqual({ piece: 'curve45', rotation: 90 });
    expect(pieceForRoute(pieces, undefined, 'SW', 'SE')).toBeNull(); // 90° between diagonals
    expect(pieceForRoute(pieces, undefined, 'E', 'E')).toBeNull();
    expect(pieceForRoute(pieces, ['straight', 'curve'], 'W', 'SE')).toBeNull(); // not allowed
  });

  it('only the straight draws lines', () => {
    const lines = Object.values(testCatalogs.pieces)
      .filter(isLinePiece)
      .map((p) => p.id);
    expect(lines).toEqual(['straight']);
  });
});

describe('Feature: Draw track by dragging', () => {
  it('Scenario: Dragging along a row lays a horizontal line', async () => {
    const stores = await storesWith(makeLevel());
    stroke(
      stores,
      [5, 6, 7, 8, 9].map((x) => center(x, 5)),
    );
    expect([5, 6, 7, 8, 9].map((x) => trackOf(stores, x, 5))).toEqual(
      Array(5).fill(['straight', 90]),
    );
    expect(ready(stores).past).toHaveLength(1);
    stores.game.getState().undo();
    expect([5, 6, 7, 8, 9].map((x) => trackOf(stores, x, 5))).toEqual(Array(5).fill(null));
  });

  it('Scenario: A diagonal drag lays a diagonal line, not a staircase', async () => {
    const stores = await storesWith(makeLevel());
    // A real pointer crosses the orthogonal neighbors near the corners.
    stroke(stores, [center(5, 5), { x: 6.05, y: 5.95 }, { x: 6.5, y: 6.5 }, { x: 8.5, y: 8.5 }]);
    expect([5, 6, 7, 8].map((i) => trackOf(stores, i, i))).toEqual(
      Array(4).fill(['straight', 135]),
    );
    expect(trackOf(stores, 6, 5)).toBeNull();
    expect(trackOf(stores, 5, 6)).toBeNull();
  });

  it('Scenario: Turns become curves', async () => {
    const stores = await storesWith(makeLevel());
    stroke(stores, [center(5, 5), center(8, 5), center(8, 8)]);
    expect(trackOf(stores, 8, 5)?.[0]).toBe('curve');
    expect(trackOf(stores, 8, 6)).toEqual(['straight', 0]);

    stroke(stores, [center(5, 10), center(8, 10), center(10, 12)]);
    expect(trackOf(stores, 8, 10)).toEqual(['curve45', 90]);
    expect(trackOf(stores, 9, 11)).toEqual(['straight', 135]);
    expect(trackOf(stores, 10, 12)).toEqual(['straight', 135]);
  });

  it('Scenario: Turns that cannot be drawn are refused', async () => {
    const stores = await storesWith(makeLevel());
    stroke(stores, [center(5, 5), center(8, 5), center(3, 5)]);
    expect(trackOf(stores, 8, 5)).toEqual(['straight', 90]);
    expect(trackOf(stores, 9, 5)).toBeNull();
    // A 90° turn between diagonals cannot be drawn either.
    stroke(stores, [center(5, 20), center(7, 22), center(9, 20)]);
    expect(trackOf(stores, 7, 22)).toEqual(['straight', 135]);
    expect(trackOf(stores, 8, 21)).toBeNull();
  });

  it('Scenario: Existing track is never changed', async () => {
    const stores = await storesWith(makeLevel());
    stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(7, 5), piece: 'curve', rotation: 0 });
    stroke(
      stores,
      [5, 6, 7, 8, 9].map((x) => center(x, 5)),
    );
    expect(trackOf(stores, 7, 5)).toEqual(['curve', 0]);
    expect([5, 6, 8, 9].map((x) => trackOf(stores, x, 5))).toEqual(Array(4).fill(['straight', 90]));
  });

  it('a shaky drag along a row boundary still lays a straight line', async () => {
    const stores = await storesWith(makeLevel());
    // The pointer wobbles across the border between rows 5 and 6 while moving east.
    const points: GridPoint[] = [{ x: 5.5, y: 5.9 }];
    for (let x = 5.6; x <= 12.5; x += 0.15) points.push({ x, y: 6 + Math.sin(x * 7) * 0.35 });
    stroke(stores, points);
    const placed = ready(stores).game.world.tracks.map((t) => [
      t.at.x,
      t.at.y,
      t.piece,
      t.rotation,
    ]);
    expect(placed).toEqual([5, 6, 7, 8, 9, 10, 11, 12].map((x) => [x, 5, 'straight', 90]));
  });

  it('the line finishes in the cell where the pointer is released', async () => {
    const stores = await storesWith(makeLevel());
    stroke(stores, [center(5, 5), { x: 7.5, y: 5.5 }, { x: 8.1, y: 5.5 }]);
    expect(trackOf(stores, 8, 5)).toEqual(['straight', 90]);
  });

  it('Scenario: A click without dragging still places one piece', async () => {
    const stores = await storesWith(makeLevel());
    stroke(stores, [center(5, 5)]);
    expect(trackOf(stores, 5, 5)).toEqual(['straight', 0]);
  });

  it('a failed click is reported only when nothing was drawn', async () => {
    const stores = await storesWith(makeLevel());
    stroke(stores, [center(5, 5)]);
    stroke(stores, [center(5, 5)]);
    expect(stores.editor.getState().notice?.text).toBeDefined();

    const fresh = await storesWith(makeLevel());
    fresh.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(5, 5), piece: 'straight', rotation: 90 });
    stroke(fresh, [center(5, 5), center(7, 5)]); // starts on existing track and draws on
    expect(fresh.editor.getState().notice).toBeNull();
    expect(trackOf(fresh, 7, 5)).toEqual(['straight', 90]);
  });

  it('a drawn line costs the same as placing its pieces one by one', async () => {
    const stores = await storesWith(
      makeLevel({}, { economy: { initialMoney: 1000, fuelPrice: 1 } }),
    );
    stroke(stores, [center(5, 5), center(8, 5), center(8, 8)]);
    // 6 straights ($10) and 1 curve ($12); re-shaped cells were refunded in full.
    expect(1000 - (ready(stores).game.ledger.build - ready(stores).game.ledger.refunds)).toBe(
      1000 - 72,
    );
  });
});
