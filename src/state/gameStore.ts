import { createStore } from 'zustand/vanilla';
import { MAX_UNDO } from '../core/constants';
import { applyAction, type ActionOutcome, type EditorAction } from '../core/editor/actions';
import {
  createGameState,
  isSimulating,
  rulesContext,
  type GameState,
  type RulesContext,
} from '../core/game/state';
import type { Cell } from '../core/grid/coords';
import {
  enterEditorMode,
  enterRunMode,
  flipSwitch,
  setPaused,
  setTrainRunning,
  type RunOutcome,
} from '../core/sim/commands';
import { advance, type SimEvent } from '../core/sim/step';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Level, LevelIndexEntry } from '../data/schemas/level';
import { DataError, type Issue } from '../data/validate';
import type { LoadNotice, SavedLookup } from '../persistence/saveRepository';

export type ReadySession = {
  readonly status: 'ready';
  readonly levelId: string;
  readonly level: Level;
  readonly ctx: RulesContext;
  readonly game: GameState;
  /** Undo stack (most recent last) and redo stack (next redo last). */
  readonly past: readonly GameState[];
  readonly future: readonly GameState[];
  /** State before the current drag stroke started; a stroke becomes one undo step. */
  readonly strokeBase: GameState | null;
  /** Increments on every (re)load, restart or import: a fresh game, not an edit. */
  readonly loadId: number;
  /** Shown once after loading (e.g. "Saved game is corrupted"). */
  readonly notice: LoadNotice | null;
};

export type LevelSession =
  | { readonly status: 'idle' }
  | { readonly status: 'loading'; readonly levelId: string }
  | ReadySession
  | {
      readonly status: 'error';
      readonly levelId: string;
      readonly message: string;
      readonly issues: readonly Issue[];
    };

const NOT_READY: ActionOutcome = { ok: false, reason: 'No level loaded', label: '' };

export type LoadOptions = { readonly game?: GameState; readonly notice?: LoadNotice | null };

export type GameStoreState = {
  readonly catalogs: Catalogs;
  readonly levels: readonly LevelIndexEntry[];
  readonly session: LevelSession;
  /** Loads a level, restoring its saved game unless `options.game` provides one. */
  loadLevel: (levelId: string, options?: LoadOptions) => Promise<void>;
  /** Discards the saved game and starts the current level from its initial state. */
  restart: () => void;
  /** Applies an editor action. Failed actions leave the state untouched. */
  execute: (action: EditorAction) => ActionOutcome;
  beginStroke: () => void;
  endStroke: () => void;
  undo: () => void;
  redo: () => void;
  /** Leaves the editor: starts (or resumes) the simulation and clears the undo history. */
  startRun: () => void;
  /** Back to Editor Mode: the simulation pauses and keeps its state. */
  enterEditor: () => void;
  setPaused: (paused: boolean) => void;
  /** Advances the simulation (only while running and not paused). */
  tick: (ticks: number) => readonly SimEvent[];
  flipSwitch: (cell: Cell) => RunOutcome;
  setTrainRunning: (trainId: string, running: boolean) => RunOutcome;
};

/** Saved games, as seen by the store (implemented by persistence/saveRepository). */
export type SavedGames = {
  load(levelId: string, level: Level): SavedLookup;
  remove(levelId: string): void;
};

export type GameStoreDeps = {
  catalogs: Catalogs;
  levels: readonly LevelIndexEntry[];
  loadLevel: (levelId: string, catalogs: Catalogs) => Promise<Level>;
  saves?: SavedGames;
};

export type GameStore = ReturnType<typeof createGameStore>;

const pushCapped = <T>(stack: readonly T[], item: T): T[] => [...stack, item].slice(-MAX_UNDO);

function isLoading(session: LevelSession, levelId: string): boolean {
  return session.status === 'loading' && session.levelId === levelId;
}

export function createGameStore(deps: GameStoreDeps) {
  let loadCounter = 0;
  let inflight: Promise<void> | null = null;

  const fresh = (
    levelId: string,
    level: Level,
    game: GameState,
    notice: LoadNotice | null,
  ): ReadySession => ({
    status: 'ready',
    levelId,
    level,
    ctx: rulesContext(level, deps.catalogs),
    game,
    past: [],
    future: [],
    strokeBase: null,
    loadId: ++loadCounter,
    notice,
  });

  /** The game to start with: an explicit one, the saved one, or the level's initial state. */
  const startingGame = (levelId: string, level: Level, options: LoadOptions | undefined) => {
    if (options?.game) return { game: options.game, notice: options.notice ?? null };
    const saved = deps.saves?.load(levelId, level) ?? { kind: 'none' };
    if (saved.kind === 'restored') return { game: saved.game, notice: saved.notice };
    return {
      game: createGameState(level, deps.catalogs),
      notice: saved.kind === 'corrupt' ? saved.notice : null,
    };
  };

  return createStore<GameStoreState>()((set, get) => {
    /** Updates the ready session; does nothing if no level is loaded. */
    const updateReady = (update: (session: ReadySession) => Partial<ReadySession> | null) => {
      const { session } = get();
      if (session.status !== 'ready') return;
      const patch = update(session);
      if (patch) set({ session: { ...session, ...patch } });
    };

    /** Applies a run command (not undoable: the simulation moves on). */
    const runCommand = (command: (session: ReadySession) => RunOutcome): RunOutcome => {
      const { session } = get();
      if (session.status !== 'ready') return { ok: false, reason: 'No level loaded' };
      const outcome = command(session);
      if (outcome.ok) updateReady(() => ({ game: outcome.state }));
      return outcome;
    };

    const load = async (levelId: string, options: LoadOptions | undefined): Promise<void> => {
      try {
        const level = await deps.loadLevel(levelId, deps.catalogs);
        // Ignore stale responses when another level was requested meanwhile.
        if (!isLoading(get().session, levelId)) return;
        const { game, notice } = startingGame(levelId, level, options);
        set({ session: fresh(levelId, level, game, notice) });
      } catch (error) {
        if (!isLoading(get().session, levelId)) return;
        set({
          session: {
            status: 'error',
            levelId,
            message: error instanceof Error ? error.message : String(error),
            issues: error instanceof DataError ? error.issues : [],
          },
        });
      }
    };

    return {
      catalogs: deps.catalogs,
      levels: deps.levels,
      session: { status: 'idle' },

      loadLevel: (levelId, options) => {
        // A repeated plain request while that level is loading (e.g. React StrictMode running
        // effects twice) joins the load in flight instead of creating a second game.
        if (!options && inflight && isLoading(get().session, levelId)) return inflight;
        set({ session: { status: 'loading', levelId } });
        inflight = load(levelId, options);
        return inflight;
      },

      restart: () => {
        const { session } = get();
        if (session.status !== 'ready') return;
        deps.saves?.remove(session.levelId);
        const game = createGameState(session.level, deps.catalogs);
        set({ session: fresh(session.levelId, session.level, game, null) });
      },

      execute: (action) => {
        const { session } = get();
        if (session.status !== 'ready') return NOT_READY;
        const outcome = applyAction(session.game, session.ctx, action);
        if (!outcome.ok) return outcome;
        updateReady((s) =>
          s.strokeBase
            ? { game: outcome.state }
            : { game: outcome.state, past: pushCapped(s.past, s.game), future: [] },
        );
        return outcome;
      },

      beginStroke: () => {
        updateReady((s) => (s.strokeBase ? null : { strokeBase: s.game }));
      },

      endStroke: () => {
        updateReady((s) => {
          if (!s.strokeBase) return null;
          if (s.strokeBase === s.game) return { strokeBase: null };
          return { strokeBase: null, past: pushCapped(s.past, s.strokeBase), future: [] };
        });
      },

      undo: () => {
        updateReady((s) => {
          const previous = s.past.at(-1);
          if (!previous || s.strokeBase || s.game.mode !== 'editing') return null;
          return { game: previous, past: s.past.slice(0, -1), future: [...s.future, s.game] };
        });
      },

      redo: () => {
        updateReady((s) => {
          const next = s.future.at(-1);
          if (!next || s.strokeBase || s.game.mode !== 'editing') return null;
          return { game: next, future: s.future.slice(0, -1), past: pushCapped(s.past, s.game) };
        });
      },

      startRun: () => {
        updateReady((s) => {
          if (s.strokeBase) return null;
          return { game: enterRunMode(s.game), past: [], future: [] };
        });
      },

      enterEditor: () => {
        updateReady((s) => ({ game: enterEditorMode(s.game) }));
      },

      setPaused: (paused) => {
        updateReady((s) =>
          s.game.mode === 'running' ? { game: setPaused(s.game, paused) } : null,
        );
      },

      tick: (ticks) => {
        const { session } = get();
        if (session.status !== 'ready' || !isSimulating(session.game) || ticks <= 0) return [];
        const result = advance(session.game, session.ctx, ticks);
        updateReady(() => ({ game: result.state }));
        return result.events;
      },

      flipSwitch: (cell) => runCommand((s) => flipSwitch(s.game, s.ctx, cell)),

      setTrainRunning: (trainId, running) =>
        runCommand((s) => setTrainRunning(s.game, trainId, running)),
    };
  });
}
