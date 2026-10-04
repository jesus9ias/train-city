import type { Catalogs } from '../data/schemas/catalogs';
import type { Level } from '../data/schemas/level';
import type { Result } from '../data/validate';
import type { AppStores } from '../state/stores';
import { createAutosave } from './autosave';
import {
  downloadText,
  exportFileName,
  exportText,
  prepareImport,
  readSaveFile,
} from './exportImport';
import type { SaveRepository } from './saveRepository';
import { syncProgress } from './progress';
import { syncSettings } from './settings';
import type { SafeStorage } from './storage';

/** Game file actions offered to the UI. */
export type GameFileActions = {
  readonly exportGame: () => void;
  readonly importFile: (file: Blob) => Promise<Result<void>>;
  readonly restart: () => void;
};

export type PersistenceDeps = {
  stores: AppStores;
  storage: SafeStorage;
  repository: SaveRepository;
  catalogs: Catalogs;
  loadLevel: (levelId: string, catalogs: Catalogs) => Promise<Level>;
  gameVersion: string;
  now: () => Date;
  download?: (fileName: string, text: string) => void;
};

/** Wires autosave, settings and import/export to the stores. */
export function createPersistence(deps: PersistenceDeps) {
  const { stores, repository } = deps;
  const download = deps.download ?? downloadText;

  const autosave = createAutosave({
    game: stores.game,
    repository,
    now: deps.now,
    onStatus: (status) => {
      stores.saveStatus.getState().setStatus(status);
    },
    onFailure: (message) => {
      stores.editor
        .getState()
        .notify(`${message}: your progress is not being saved. Download your game to keep it.`);
    },
  });
  const stopSettings = syncSettings(deps.storage, stores.view);
  const stopProgress = syncProgress(deps.storage, stores.progress, stores.game);

  const actions: GameFileActions = {
    exportGame: () => {
      const { session } = stores.game.getState();
      if (session.status !== 'ready') return;
      const now = deps.now();
      download(
        exportFileName(session.levelId, now),
        exportText(session.game, session.level, deps.gameVersion, now),
      );
    },

    importFile: async (file) => {
      const text = await readSaveFile(file);
      if (!text.ok) return text;
      const prepared = await prepareImport(text.value, deps);
      if (!prepared.ok) return prepared;
      const { level, game, notice } = prepared.value;
      await stores.game.getState().loadLevel(level.id, {
        game,
        notice: notice ?? { text: 'Game imported', tone: 'info' },
      });
      repository.save(level, game);
      return { ok: true, value: undefined };
    },

    restart: () => {
      stores.game.getState().restart();
    },
  };

  return {
    actions,
    /** Writes pending changes immediately (call on page unload). */
    flush: () => {
      autosave.flush();
    },
    dispose() {
      autosave.dispose();
      stopSettings();
      stopProgress();
    },
  };
}

export type Persistence = ReturnType<typeof createPersistence>;
