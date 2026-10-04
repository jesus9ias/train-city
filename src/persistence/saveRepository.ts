import type { GameState } from '../core/game/state';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Level } from '../data/schemas/level';
import { gameToSave, levelHash, parseSaveText, saveToGame } from './serialize';
import { STORAGE_KEYS, type SafeStorage, type WriteResult } from './storage';

export type LoadNotice = { readonly text: string; readonly tone: 'error' | 'info' };

export type SavedLookup =
  | { readonly kind: 'none' }
  | { readonly kind: 'restored'; readonly game: GameState; readonly notice: LoadNotice | null }
  | { readonly kind: 'corrupt'; readonly notice: LoadNotice };

export const NOTICES = {
  corrupt: { text: 'Saved game is corrupted. Starting the level from scratch.', tone: 'error' },
  levelChanged: { text: 'This level was updated since your last save.', tone: 'info' },
} as const satisfies Record<string, LoadNotice>;

export type SaveRepository = {
  load(levelId: string, level: Level): SavedLookup;
  save(level: Level, game: GameState): WriteResult;
  remove(levelId: string): void;
};

export function createSaveRepository(deps: {
  storage: SafeStorage;
  catalogs: Catalogs;
  gameVersion: string;
  now: () => Date;
}): SaveRepository {
  const { storage, catalogs } = deps;

  /** Keeps the broken save under a "corrupt" key for debugging, then removes it. */
  const quarantine = (levelId: string, raw: string): SavedLookup => {
    const stamp = deps.now().toISOString().replace(/[:.]/g, '-');
    storage.write(STORAGE_KEYS.corrupt(levelId, stamp), raw);
    storage.remove(STORAGE_KEYS.save(levelId));
    return { kind: 'corrupt', notice: NOTICES.corrupt };
  };

  return {
    load(levelId, level) {
      const raw = storage.read(STORAGE_KEYS.save(levelId));
      if (raw === null) return { kind: 'none' };
      const parsed = parseSaveText(raw);
      if (!parsed.ok) return quarantine(levelId, raw);
      const game = saveToGame(parsed.value, level, catalogs);
      if (!game.ok) return quarantine(levelId, raw);
      const changed = parsed.value.levelHash !== levelHash(level);
      return { kind: 'restored', game: game.value, notice: changed ? NOTICES.levelChanged : null };
    },
    save(level, game) {
      const save = gameToSave(game, level, { gameVersion: deps.gameVersion, savedAt: deps.now() });
      return storage.write(STORAGE_KEYS.save(level.id), JSON.stringify(save));
    },
    remove(levelId) {
      storage.remove(STORAGE_KEYS.save(levelId));
    },
  };
}
