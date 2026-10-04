import { describe, expect, it } from 'vitest';
import { loadCatalogs, loadLevel, loadLevelIndex } from '../data/loader';
import type { Level } from '../data/schemas/level';
import { DataError } from '../data/validate';
import { createGameStore } from './gameStore';

const catalogs = loadCatalogs();
const levels = loadLevelIndex().levels;

describe('gameStore', () => {
  it('loads a level and builds its world', async () => {
    const store = createGameStore({ catalogs, levels, loadLevel });
    const pending = store.getState().loadLevel('level-001');
    expect(store.getState().session).toEqual({ status: 'loading', levelId: 'level-001' });
    await pending;
    const session = store.getState().session;
    expect(session.status).toBe('ready');
    if (session.status === 'ready') {
      expect(session.game.world.cols).toBe(50);
      expect(session.game.world.stations).toHaveLength(2);
    }
  });

  it('reports validation issues', async () => {
    const issues = [{ path: 'level: map.widthPx', message: 'widthPx must be a multiple of 20' }];
    const store = createGameStore({
      catalogs,
      levels,
      loadLevel: () => Promise.reject(new DataError('levels/bad.json', issues)),
    });
    await store.getState().loadLevel('bad');
    expect(store.getState().session).toMatchObject({ status: 'error', levelId: 'bad', issues });
  });

  it('reports unexpected errors without issues', async () => {
    const store = createGameStore({
      catalogs,
      levels,
      loadLevel: () => Promise.reject(new Error('network down')),
    });
    await store.getState().loadLevel('x');
    expect(store.getState().session).toMatchObject({
      status: 'error',
      message: 'network down',
      issues: [],
    });
  });

  it('ignores a stale load when another level was requested meanwhile', async () => {
    let resolveFirst: (level: Level) => void = () => undefined;
    let rejectFirst: (error: Error) => void = () => undefined;
    const store = createGameStore({
      catalogs,
      levels,
      loadLevel: (id) =>
        id === 'slow' || id === 'slow-fail'
          ? new Promise<Level>((resolve, reject) => {
              resolveFirst = resolve;
              rejectFirst = reject;
            })
          : loadLevel(id, catalogs),
    });
    const slow = store.getState().loadLevel('slow');
    await store.getState().loadLevel('sandbox');
    resolveFirst(await loadLevel('level-001', catalogs));
    await slow;
    expect(store.getState().session).toMatchObject({ status: 'ready', levelId: 'sandbox' });

    const slowFail = store.getState().loadLevel('slow-fail');
    await store.getState().loadLevel('sandbox');
    rejectFirst(new Error('late failure'));
    await slowFail;
    expect(store.getState().session).toMatchObject({ status: 'ready', levelId: 'sandbox' });
  });
});
