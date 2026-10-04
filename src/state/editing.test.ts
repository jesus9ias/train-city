import { describe, expect, it } from 'vitest';
import { REASONS } from '../core/editor/actions';
import { moneyOf } from '../core/game/state';
import { terrainAt, trackAt } from '../core/world/world';
import type { Level } from '../data/schemas/level';
import { makeLevel, testCatalogs } from '../test/fixtures';
import { createEditorController, isDragTool, previewAt, toolAction } from './editorController';
import { sameTool } from './editorStore';
import type { ReadySession } from './gameStore';
import { createAppStores, type AppStores } from './stores';

async function storesWith(level: Level): Promise<AppStores> {
  const stores = createAppStores({
    catalogs: testCatalogs,
    levels: [{ id: level.id, name: level.name, unlocked: true }],
    loadLevel: () => Promise.resolve(level),
  });
  await stores.game.getState().loadLevel(level.id);
  return stores;
}

function ready(stores: AppStores): ReadySession {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('level not ready');
  return session;
}

const at = (x: number, y: number) => ({ x, y });

describe('Feature: Build tracks — Scenario: Undo and redo', () => {
  it('undoes and redoes a placement, including its cost', async () => {
    const stores = await storesWith(
      makeLevel({}, { economy: { initialMoney: 100, fuelPrice: 1 } }),
    );
    const { execute, undo, redo } = stores.game.getState();

    execute({ type: 'placeTrack', cell: at(10, 10), piece: 'straight', rotation: 0 });
    expect(moneyOf(ready(stores).game)).toBe(90);

    undo();
    expect(trackAt(ready(stores).game.world, at(10, 10))).toBeUndefined();
    expect(moneyOf(ready(stores).game)).toBe(100);

    redo();
    expect(trackAt(ready(stores).game.world, at(10, 10))?.piece).toBe('straight');
    expect(moneyOf(ready(stores).game)).toBe(90);
  });

  it('a new action clears the redo stack; undo/redo do nothing at the ends', async () => {
    const stores = await storesWith(makeLevel());
    const { execute, undo, redo } = stores.game.getState();
    undo();
    redo();
    expect(ready(stores).past).toHaveLength(0);

    execute({ type: 'placeTrack', cell: at(1, 1), piece: 'straight', rotation: 0 });
    undo();
    execute({ type: 'placeTrack', cell: at(2, 2), piece: 'straight', rotation: 0 });
    expect(ready(stores).future).toHaveLength(0);
    expect(ready(stores).past).toHaveLength(1);
  });

  it('failed actions do not touch the history', async () => {
    const stores = await storesWith(makeLevel());
    const outcome = stores.game
      .getState()
      .execute({ type: 'placeTrack', cell: at(-1, 0), piece: 'straight', rotation: 0 });
    expect(outcome).toMatchObject({ ok: false, reason: REASONS.outside });
    expect(ready(stores).past).toHaveLength(0);
  });

  it('keeps at most 100 undo steps', async () => {
    const stores = await storesWith(makeLevel());
    for (let i = 0; i < 105; i++) {
      stores.game.getState().execute({
        type: 'placeTrack',
        cell: at(i % 50, Math.floor(i / 50)),
        piece: 'straight',
        rotation: 0,
      });
    }
    expect(ready(stores).past).toHaveLength(100);
  });
});

describe('Feature: Paint terrain in the editor — brush strokes', () => {
  it('Scenario: Paint with the brush — a drag stroke is one undo step', async () => {
    const stores = await storesWith(makeLevel());
    stores.editor.getState().selectTool({ kind: 'terrain', terrain: 'snow' });
    const controller = createEditorController(stores);

    controller.down(at(1, 1));
    controller.drag(at(1, 1)); // same cell: ignored
    controller.drag(at(2, 1));
    controller.drag(at(3, 1));
    expect(ready(stores).past).toHaveLength(0); // still inside the stroke
    stores.game.getState().undo(); // ignored while stroking
    controller.up();

    const { game, past } = ready(stores);
    expect([1, 2, 3].map((x) => terrainAt(game.world, at(x, 1)))).toEqual(['snow', 'snow', 'snow']);
    expect(past).toHaveLength(1);

    stores.game.getState().undo();
    expect(terrainAt(ready(stores).game.world, at(2, 1))).toBe('grass');
  });

  it('a stroke that changes nothing adds no history', async () => {
    const stores = await storesWith(makeLevel());
    stores.editor.getState().selectTool({ kind: 'terrain', terrain: 'grass' });
    const controller = createEditorController(stores);
    controller.down(at(1, 1));
    controller.up();
    expect(ready(stores).past).toHaveLength(0);
    expect(stores.editor.getState().notice?.text).toBe(REASONS.noChange);
  });
});

describe('editor controller', () => {
  it('reports failures on click but not while dragging', async () => {
    const stores = await storesWith(
      makeLevel({ objects: [{ type: 'house_s', at: at(5, 5), locked: true }] }),
    );
    stores.editor.getState().selectTool({ kind: 'erase' });
    const controller = createEditorController(stores);
    controller.down(at(1, 1));
    expect(stores.editor.getState().notice?.text).toBe(REASONS.nothingToErase);
    stores.editor.getState().dismissNotice(stores.editor.getState().notice?.id ?? 0);
    controller.drag(at(5, 5));
    controller.up();
    expect(stores.editor.getState().notice).toBeNull();
  });

  it('only drag tools act while dragging', async () => {
    const stores = await storesWith(makeLevel());
    stores.editor.getState().selectTool({ kind: 'track', piece: 'straight' });
    const controller = createEditorController(stores);
    controller.down(at(1, 1));
    controller.drag(at(2, 1));
    controller.up();
    controller.drag(at(3, 1)); // after up: ignored
    expect(ready(stores).game.world.tracks).toHaveLength(1);
  });

  it('inspect selects the cell without editing', async () => {
    const stores = await storesWith(makeLevel());
    stores.editor.getState().selectTool({ kind: 'inspect' });
    createEditorController(stores).down(at(7, 8));
    expect(stores.editor.getState().inspected).toEqual(at(7, 8));
    expect(ready(stores).past).toHaveLength(0);
  });

  it('places tracks with the current rotation (press R, then click)', async () => {
    const stores = await storesWith(makeLevel());
    stores.editor.getState().selectTool({ kind: 'track', piece: 'straight' });
    stores.editor.getState().rotate();
    createEditorController(stores).down(at(10, 10));
    expect(trackAt(ready(stores).game.world, at(10, 10))?.rotation).toBe(90);
  });

  it('maps tools to actions and previews them', async () => {
    const stores = await storesWith(makeLevel());
    expect(toolAction(null, 0, at(1, 1))).toBeNull();
    expect(toolAction({ kind: 'inspect' }, 0, at(1, 1))).toBeNull();
    expect(toolAction({ kind: 'object', object: 'rock' }, 0, at(1, 1))).toEqual({
      type: 'placeObject',
      cell: at(1, 1),
      object: 'rock',
    });
    expect(toolAction({ kind: 'rotate' }, 0, at(1, 1))).toEqual({
      type: 'rotateTrack',
      cell: at(1, 1),
    });
    expect(isDragTool({ kind: 'erase' })).toBe(true);
    expect(isDragTool({ kind: 'track', piece: 'x' })).toBe(false);

    const preview = previewAt(ready(stores), { kind: 'track', piece: 'straight' }, 0, at(1, 1));
    expect(preview).toMatchObject({ ok: true, delta: -10, label: 'Straight' });
    expect(previewAt(ready(stores), null, 0, at(1, 1))).toBeNull();
    // Previews never change the state.
    expect(ready(stores).game.world.tracks).toHaveLength(0);
  });
});

describe('editor store', () => {
  it('rotates, toggles and notifies', () => {
    const stores = createAppStores({
      catalogs: testCatalogs,
      levels: [],
      loadLevel: () => Promise.reject(new Error('x')),
    });
    const editor = stores.editor.getState();
    editor.rotate();
    editor.rotate();
    editor.rotate();
    editor.rotate();
    expect(stores.editor.getState().rotation).toBe(0);
    editor.toggleNetwork();
    expect(stores.editor.getState().showNetwork).toBe(true);
    editor.notify('Hello', 'info');
    const notice = stores.editor.getState().notice;
    expect(notice).toMatchObject({ text: 'Hello', tone: 'info' });
    editor.dismissNotice(999);
    expect(stores.editor.getState().notice).not.toBeNull();
    editor.selectTool({ kind: 'erase' });
    editor.reset();
    expect(stores.editor.getState()).toMatchObject({ tool: null, notice: null, rotation: 0 });
    expect(sameTool({ kind: 'erase' }, { kind: 'erase' })).toBe(true);
    expect(sameTool({ kind: 'erase' }, null)).toBe(false);
  });

  it('editing without a loaded level does nothing', () => {
    const stores = createAppStores({
      catalogs: testCatalogs,
      levels: [],
      loadLevel: () => Promise.reject(new Error('x')),
    });
    const outcome = stores.game.getState().execute({ type: 'erase', cell: at(1, 1) });
    expect(outcome.ok).toBe(false);
    stores.game.getState().undo();
    stores.game.getState().beginStroke();
    stores.game.getState().endStroke();
    expect(stores.game.getState().session.status).toBe('idle');
  });
});
