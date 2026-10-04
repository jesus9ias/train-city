import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { loadAtlasManifest } from '../data/loader';
import type { GameFileActions } from '../persistence';
import { GameCanvas } from '../render/GameCanvas';
import type { WorldSceneData } from '../render/scenes/WorldScene';
import type { AppStores } from '../state/stores';
import { CursorTooltip } from '../ui/CursorTooltip';
import { DataErrorPanel } from '../ui/DataErrorPanel';
import { GameMenu } from '../ui/GameMenu';
import { Inspector } from '../ui/Inspector';
import { ModeBar } from '../ui/ModeBar';
import { ResultDialog } from '../ui/ResultDialog';
import { nextLevelId } from '../state/progressStore';
import { LevelPicker } from '../ui/LevelPicker';
import { Palette } from '../ui/Palette';
import { StatusBar } from '../ui/StatusBar';
import { Toast } from '../ui/Toast';
import { RunPanel } from '../ui/TrainPanel';
import { MapControls } from '../ui/MapControls';
import { COMPACT_QUERY, useMediaQuery } from '../ui/useMediaQuery';
import { useShortcuts } from '../ui/useShortcuts';

type Drawer = 'tools' | 'info';

type Props = {
  stores: AppStores;
  initialLevelId: string;
  /** Called when the player picks another level (e.g. to update the URL). */
  onLevelChange?: (levelId: string) => void;
  /** Download, import and restart; omitted when persistence is not wired (tests). */
  fileActions?: GameFileActions;
};

export function App({ stores, initialLevelId, onLevelChange, fileActions }: Props) {
  const { game, editor } = stores;
  const session = useStore(game, (s) => s.session);
  const levels = useStore(game, (s) => s.levels);
  const catalogs = useStore(game, (s) => s.catalogs);
  const results = useStore(stores.progress, (s) => s.results);
  const [atlases] = useState(() => loadAtlasManifest().atlases);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  useShortcuts(stores);

  // Compact layout: picking a tool hands the screen back to the map, and selecting a train
  // shows its details (spec.md §13.1).
  useEffect(
    () =>
      editor.subscribe((state, prev) => {
        if (state.tool && state.tool !== prev.tool) {
          setDrawer((open) => (open === 'tools' ? null : open));
        }
        if (state.selectedTrain && state.selectedTrain !== prev.selectedTrain) setDrawer('info');
      }),
    [editor],
  );
  /** Drawers only exist in the compact layout. */
  const openDrawer = compact ? drawer : null;

  useEffect(() => {
    void game.getState().loadLevel(initialLevelId);
  }, [game, initialLevelId]);

  const levelId = session.status === 'idle' ? undefined : session.levelId;
  useEffect(() => {
    editor.getState().reset();
  }, [editor, levelId]);

  // Show load notices (restored, corrupted or imported save) once per load.
  const loadId = session.status === 'ready' ? session.loadId : null;
  const loadNotice = session.status === 'ready' ? session.notice : null;
  useEffect(() => {
    if (loadId !== null && loadNotice) editor.getState().notify(loadNotice.text, loadNotice.tone);
  }, [editor, loadId, loadNotice]);

  const sceneData = useMemo<WorldSceneData>(() => ({ catalogs, atlases }), [catalogs, atlases]);

  const selectLevel = (id: string) => {
    onLevelChange?.(id);
    void game.getState().loadLevel(id);
  };

  const toggle = (name: Drawer) => {
    setDrawer(openDrawer === name ? null : name);
  };
  /** In the compact layout, side panels live in drawers over the map. */
  const inDrawer = (name: Drawer, panel: ReactNode) =>
    compact ? (
      <div
        className={`drawer drawer--${name === 'tools' ? 'left' : 'right'}`}
        hidden={openDrawer !== name}
        data-testid={`drawer-${name}`}
      >
        <button
          type="button"
          className="tool-button drawer__close"
          aria-label="Close panel"
          onClick={() => {
            setDrawer(null);
          }}
        >
          ✕
        </button>
        {panel}
      </div>
    ) : (
      panel
    );

  return (
    <div className={`app${compact ? ' app--compact' : ''}`}>
      <header className="top-bar">
        <h1 className="top-bar__title">Train City</h1>
        <LevelPicker levels={levels} results={results} currentId={levelId} onSelect={selectLevel} />
        {session.status === 'ready' && (
          <span className="top-bar__subtitle" data-testid="level-description">
            {session.level.description}
          </span>
        )}
        {session.status === 'ready' && <ModeBar stores={stores} session={session} />}
        {session.status === 'ready' && compact && (
          <div className="top-bar__drawers">
            <button
              type="button"
              className="tool-button"
              aria-expanded={openDrawer === 'tools'}
              onClick={() => {
                toggle('tools');
              }}
            >
              {session.game.mode === 'editing' ? 'Build' : 'Trains'}
            </button>
            <button
              type="button"
              className="tool-button"
              aria-expanded={openDrawer === 'info'}
              onClick={() => {
                toggle('info');
              }}
            >
              Info
            </button>
          </div>
        )}
        {session.status === 'ready' && fileActions && (
          <GameMenu actions={fileActions} saveStatus={stores.saveStatus} compact={compact} />
        )}
      </header>
      <div className="app__body">
        {session.status === 'ready' &&
          inDrawer(
            'tools',
            session.game.mode === 'editing' ? (
              <Palette stores={stores} session={session} />
            ) : (
              <RunPanel stores={stores} session={session} />
            ),
          )}
        <main
          className="app__main"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top });
          }}
          onMouseLeave={() => {
            setPointer(null);
          }}
        >
          {session.status === 'ready' && (
            <>
              <GameCanvas
                key={`${session.levelId}:${session.loadId}`}
                stores={stores}
                data={sceneData}
              />
              <CursorTooltip stores={stores} session={session} position={pointer} />
              {compact && <MapControls stores={stores} session={session} />}
            </>
          )}
          {session.status === 'loading' && <p className="app__notice">Loading level…</p>}
          {session.status === 'error' && (
            <DataErrorPanel
              title={`Could not load level "${session.levelId}"`}
              message={session.message}
              issues={session.issues}
            />
          )}
          <Toast editor={editor} />
          {session.status === 'ready' && (
            <ResultDialog
              loadId={session.loadId}
              outcome={session.game.run.outcome}
              onRestart={() => {
                if (fileActions) fileActions.restart();
                else game.getState().restart();
              }}
              onNextLevel={(() => {
                const next = nextLevelId(levels, session.levelId);
                return next && session.game.run.outcome?.kind === 'completed'
                  ? () => {
                      selectLevel(next);
                    }
                  : undefined;
              })()}
            />
          )}
        </main>
        {session.status === 'ready' &&
          inDrawer('info', <Inspector stores={stores} session={session} />)}
        {openDrawer && (
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="Close panel"
            tabIndex={-1}
            onClick={() => {
              setDrawer(null);
            }}
          />
        )}
      </div>
      <StatusBar stores={stores} />
    </div>
  );
}
