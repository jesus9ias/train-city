import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import './app/app.css';
import { loadCatalogs, loadLevel, loadLevelIndex } from './data/loader';
import { DataError } from './data/validate';
import { installTestHook } from './lib/testHook';
import { createPersistence } from './persistence';
import { createSaveRepository } from './persistence/saveRepository';
import { safeStorage } from './persistence/storage';
import { createAppStores } from './state/stores';
import { DataErrorPanel } from './ui/DataErrorPanel';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');
const root = createRoot(rootElement);

function boot() {
  const catalogs = loadCatalogs();
  const levels = loadLevelIndex().levels;
  const storage = safeStorage(() => window.localStorage);
  const now = () => new Date();
  const repository = createSaveRepository({ storage, catalogs, gameVersion: __APP_VERSION__, now });
  const stores = createAppStores({ catalogs, levels, loadLevel, saves: repository });
  const persistence = createPersistence({
    stores,
    storage,
    repository,
    catalogs,
    loadLevel,
    gameVersion: __APP_VERSION__,
    now,
  });
  window.addEventListener('beforeunload', persistence.flush);
  installTestHook(stores);
  return { stores, persistence };
}

let app: ReturnType<typeof boot>;
try {
  app = boot();
} catch (error) {
  root.render(
    <DataErrorPanel
      title="The game data is invalid"
      message={error instanceof Error ? error.message : String(error)}
      issues={error instanceof DataError ? error.issues : []}
    />,
  );
  throw error;
}

const url = new URL(window.location.href);
const firstLevel = app.stores.game.getState().levels[0]?.id ?? '';
const initialLevelId = url.searchParams.get('level') ?? firstLevel;

/** Keeps the selected level in the URL so a reload reopens it. */
const rememberLevel = (levelId: string) => {
  url.searchParams.set('level', levelId);
  window.history.replaceState(null, '', url);
};

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App
        stores={app.stores}
        initialLevelId={initialLevelId}
        onLevelChange={rememberLevel}
        fileActions={app.persistence.actions}
      />
    </ErrorBoundary>
  </StrictMode>,
);
