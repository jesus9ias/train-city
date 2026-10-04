import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLevel } from '../data/loader';
import { createAutosave } from '../persistence/autosave';
import { makeLevel, testCatalogs } from '../test/fixtures';
import type { ReadySession } from './gameStore';
import { createAppStores, type AppStores } from './stores';

const at = (x: number, y: number) => ({ x, y });

async function storesWithTrain(): Promise<AppStores> {
  const level = makeLevel({
    tracks: Array.from({ length: 30 }, (_, i) => ({
      at: at(5, i + 1),
      piece: 'straight',
      rotation: 0,
    })),
  });
  const stores = createAppStores({
    catalogs: testCatalogs,
    levels: [],
    loadLevel: () => Promise.resolve(level),
  });
  await stores.game.getState().loadLevel(level.id);
  stores.game.getState().execute({
    type: 'placeTrain',
    cell: at(5, 25),
    locomotive: 'loco_steam',
    wagons: [],
    facing: 'N',
  });
  return stores;
}

function ready(stores: AppStores): ReadySession {
  const { session } = stores.game.getState();
  if (session.status !== 'ready') throw new Error('not ready');
  return session;
}

describe('Feature: Switching between modes (store)', () => {
  it('Scenario: Undo history is cleared when resuming', async () => {
    const stores = await storesWithTrain();
    expect(ready(stores).past).toHaveLength(1);
    stores.game.getState().startRun();
    stores.game.getState().enterEditor();
    expect(ready(stores).past).toHaveLength(0);
    stores.game.getState().undo();
    expect(ready(stores).game.trains).toHaveLength(1);
  });

  it('the clock only runs in Run Mode and not while paused', async () => {
    const stores = await storesWithTrain();
    const { tick, startRun, setPaused, enterEditor, setTrainRunning } = stores.game.getState();
    expect(tick(10)).toEqual([]);
    expect(ready(stores).game.elapsedTicks).toBe(0);

    startRun();
    setTrainRunning('t1', true);
    tick(10);
    expect(ready(stores).game.elapsedTicks).toBe(10);
    setPaused(true);
    tick(10);
    expect(ready(stores).game.elapsedTicks).toBe(10);
    setPaused(false);
    enterEditor();
    tick(10);
    expect(ready(stores).game.elapsedTicks).toBe(10);
    expect(ready(stores).game.trains[0]?.speed).toBeGreaterThan(0);
  });

  it('undo, redo and pausing are ignored where they do not apply', async () => {
    const stores = await storesWithTrain();
    const { startRun, undo, redo, setPaused } = stores.game.getState();
    setPaused(true); // not running: ignored
    expect(ready(stores).game.paused).toBe(false);
    startRun();
    undo();
    redo();
    expect(ready(stores).game.trains).toHaveLength(1);
  });

  it('run commands report errors and do nothing without a level', () => {
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    expect(stores.game.getState().flipSwitch(at(1, 1))).toEqual({
      ok: false,
      reason: 'No level loaded',
    });
    expect(stores.game.getState().tick(5)).toEqual([]);
  });
});

describe('autosave while running', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves every 5 s while running, and immediately on pause and mode changes', async () => {
    vi.useFakeTimers();
    const stores = await storesWithTrain();
    const save = vi.fn(() => ({ ok: true as const }));
    createAutosave({
      game: stores.game,
      repository: { save, remove: vi.fn() },
      onStatus: vi.fn(),
      onFailure: vi.fn(),
      now: () => new Date(0),
    });
    // The autosave starts watching at the next change; reload to give it a baseline.
    await stores.game.getState().loadLevel(ready(stores).levelId, { game: ready(stores).game });

    stores.game.getState().startRun();
    expect(save).toHaveBeenCalledTimes(1); // mode change

    stores.game.getState().setTrainRunning('t1', true);
    for (let i = 0; i < 80; i++) {
      stores.game.getState().tick(1);
      vi.advanceTimersByTime(50); // 4 s of ticks
    }
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(2); // throttled save after 5 s

    stores.game.getState().tick(1);
    stores.game.getState().setPaused(true);
    expect(save).toHaveBeenCalledTimes(3); // pause flushes right away
  });
});
