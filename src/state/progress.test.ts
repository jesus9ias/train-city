import { describe, expect, it } from 'vitest';
import { loadLevel, loadLevelIndex } from '../data/loader';
import { syncProgress } from '../persistence/progress';
import { memoryStore, safeStorage, STORAGE_KEYS } from '../persistence/storage';
import { testCatalogs } from '../test/fixtures';
import { describeEvent } from './eventMessages';
import type { ReadySession } from './gameStore';
import { createProgressStore, isUnlocked, nextLevelId } from './progressStore';
import { createAppStores } from './stores';

const completed = (stars: number, score: number) =>
  ({ kind: 'completed', stars, score, seconds: 1, fuelUsed: 1, buildCost: 1 }) as const;

describe('Feature: Objectives and scoring — Scenario: Best result is kept', () => {
  it('keeps the best stars and the best score separately', () => {
    const progress = createProgressStore();
    progress.getState().record('level-001', completed(2, 400));
    progress.getState().record('level-001', completed(3, 350));
    expect(progress.getState().results['level-001']).toEqual({ stars: 3, bestScore: 400 });
    const before = progress.getState().results;
    progress.getState().record('level-001', completed(1, 10)); // nothing better
    progress.getState().record('level-001', { kind: 'failed', reason: 'x' });
    expect(progress.getState().results).toBe(before);
  });
});

describe('level unlocking', () => {
  const levels = loadLevelIndex().levels;
  it('unlocks a level once the previous one is completed', () => {
    expect(isUnlocked(levels, {}, 'level-001')).toBe(true);
    expect(isUnlocked(levels, {}, 'level-002')).toBe(false);
    expect(isUnlocked(levels, { 'level-001': { stars: 1, bestScore: 0 } }, 'level-002')).toBe(true);
    expect(isUnlocked(levels, {}, 'nope')).toBe(false);
    expect(nextLevelId(levels, 'level-001')).toBe('level-002');
    expect(nextLevelId(levels, 'sandbox')).toBeNull();
  });
});

describe('progress persistence', () => {
  it('records completions, saves them and loads them back', async () => {
    const backend = memoryStore();
    const storage = safeStorage(() => backend);
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    const stop = syncProgress(storage, stores.progress, stores.game);
    await stores.game.getState().loadLevel('level-001');
    const { session } = stores.game.getState();
    if (session.status !== 'ready') throw new Error('not ready');
    const game = { ...session.game, run: { ...session.game.run, outcome: completed(3, 218) } };
    await stores.game.getState().loadLevel('level-001', { game });
    expect(stores.progress.getState().results['level-001']).toEqual({ stars: 3, bestScore: 218 });
    stop();

    const reloaded = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    syncProgress(storage, reloaded.progress, reloaded.game);
    expect(reloaded.progress.getState().results['level-001']).toEqual({ stars: 3, bestScore: 218 });
  });

  it('ignores corrupt progress', () => {
    const storage = safeStorage(() => memoryStore({ [STORAGE_KEYS.progress]: '{nope', other: '' }));
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    syncProgress(storage, stores.progress, stores.game);
    expect(stores.progress.getState().results).toEqual({});
    const invalid = safeStorage(() =>
      memoryStore({ [STORAGE_KEYS.progress]: JSON.stringify({ schemaVersion: 9 }) }),
    );
    syncProgress(invalid, stores.progress, stores.game);
    expect(stores.progress.getState().results).toEqual({});
  });
});

describe('event messages', () => {
  it('describes simulation events for the player', async () => {
    const stores = createAppStores({ catalogs: testCatalogs, levels: [], loadLevel });
    await stores.game.getState().loadLevel('level-001');
    const session = stores.game.getState().session as ReadySession;
    expect(describeEvent({ type: 'train_blocked', trainId: 't1' }, session)?.text).toBe(
      'Train t1 stopped: the track ends here',
    );
    expect(describeEvent({ type: 'train_derailed', trainId: 't1' }, session)?.tone).toBe('error');
    expect(describeEvent({ type: 'train_out_of_fuel', trainId: 't1' }, session)?.text).toBe(
      'Train t1 ran out of fuel',
    );
    expect(
      describeEvent(
        { type: 'cargo_delivered', trainId: 't1', stationId: 'st_B', revenue: 1500 },
        session,
      ),
    ).toEqual({ text: '+$1,500 delivered at Power Plant', tone: 'info' });
    expect(
      describeEvent(
        {
          type: 'train_crashed',
          trains: [
            { id: 't1', locomotive: 'loco_steam' },
            { id: 't2', locomotive: 'loco_unknown' },
          ],
          cell: { x: 3, y: 4 },
          lost: { coal: 40, oil: 0 },
        },
        session,
      ),
    ).toEqual({
      text: 'Crash! Steam t1 and Train t2 were destroyed (40 t coal lost)',
      tone: 'error',
    });
    expect(
      describeEvent(
        {
          type: 'train_crashed',
          trains: [
            { id: 't1', locomotive: 'loco_steam' },
            { id: 't2', locomotive: 'loco_steam' },
          ],
          cell: { x: 3, y: 4 },
          lost: {},
        },
        session,
      )?.text,
    ).toBe('Crash! Steam t1 and Steam t2 were destroyed');
    expect(describeEvent({ type: 'level_completed' }, session)).toBeNull();
    expect(describeEvent({ type: 'level_failed', reason: 'x' }, session)).toBeNull();
  });
});
