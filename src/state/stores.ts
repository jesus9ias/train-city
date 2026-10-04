import { loadCatalogs, loadLevel, loadLevelIndex } from '../data/loader';
import { createEditorStore, type EditorStore } from './editorStore';
import { createGameStore, type GameStore, type GameStoreDeps } from './gameStore';
import { createProgressStore, type ProgressStore } from './progressStore';
import { createSaveStatusStore, type SaveStatusStore } from './saveStatusStore';
import { createViewStore, type ViewStore } from './viewStore';

/** All app stores, created once per game session and injected where needed. */
export type AppStores = {
  game: GameStore;
  editor: EditorStore;
  view: ViewStore;
  saveStatus: SaveStatusStore;
  progress: ProgressStore;
};

/** Creates the stores. Throws a DataError if the bundled catalogs are invalid. */
export function createAppStores(deps?: GameStoreDeps): AppStores {
  return {
    game: createGameStore(
      deps ?? { catalogs: loadCatalogs(), levels: loadLevelIndex().levels, loadLevel },
    ),
    editor: createEditorStore(),
    view: createViewStore(),
    saveStatus: createSaveStatusStore(),
    progress: createProgressStore(),
  };
}
