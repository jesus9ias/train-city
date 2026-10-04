import type { GameState } from '../core/game/state';
import type { Level } from '../data/schemas/level';
import type { GameStore } from '../state/gameStore';
import type { SaveStatus } from '../state/saveStatusStore';
import type { SaveRepository } from './saveRepository';

export const AUTOSAVE_DELAY_MS = 1000;
/** While the simulation runs the state changes every tick: save at most this often. */
export const RUN_SAVE_INTERVAL_MS = 5000;

type Pending = { level: Level; game: GameState };

export type AutosaveDeps = {
  game: GameStore;
  repository: Pick<SaveRepository, 'save' | 'remove'>;
  onStatus: (status: SaveStatus) => void;
  /** Called once when saving starts failing (e.g. storage full). */
  onFailure: (message: string) => void;
  now: () => Date;
  delayMs?: number;
  runIntervalMs?: number;
  timers?: { set: typeof setTimeout; clear: typeof clearTimeout };
};

/**
 * Saves the current level (spec.md §7.1): 1 s after the last edit in the editor, every 5 s while
 * the simulation runs, and immediately on pause or mode change. A fresh game (level load,
 * restart, import) is not an edit: it becomes the baseline and is not written.
 */
export function createAutosave(deps: AutosaveDeps) {
  // Wrapped: calling the global timers as methods of another object throws "Illegal invocation".
  const timers = deps.timers ?? {
    set: ((fn: () => void, ms: number) => setTimeout(fn, ms)) as typeof setTimeout,
    clear: ((id: ReturnType<typeof setTimeout>) => {
      clearTimeout(id);
    }) as typeof clearTimeout,
  };
  const delay = deps.delayMs ?? AUTOSAVE_DELAY_MS;
  const runInterval = deps.runIntervalMs ?? RUN_SAVE_INTERVAL_MS;
  let loadId = -1;
  let levelId: string | null = null;
  let lastWritten: GameState | null = null;
  let pending: Pending | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failing = false;
  /** Status to show again when edits return to the last written state. */
  let settled: SaveStatus = { kind: 'idle' };
  let lastMode: { mode: GameState['mode']; paused: boolean } | null = null;

  const cancel = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
    pending = null;
  };

  const flush = () => {
    const job = pending;
    cancel();
    if (!job) return;
    const result = deps.repository.save(job.level, job.game);
    if (result.ok) {
      lastWritten = job.game;
      failing = false;
      settled = { kind: 'saved', at: deps.now() };
      deps.onStatus(settled);
    } else {
      deps.onStatus({ kind: 'error', message: result.message });
      if (!failing) deps.onFailure(result.message);
      failing = true;
    }
  };

  const unsubscribe = deps.game.subscribe(({ session }) => {
    if (session.status !== 'ready') return;
    if (session.loadId !== loadId) {
      // Switching levels saves the previous one first; a restart/import of the same level
      // must not resurrect the edits it just discarded.
      if (session.levelId === levelId) cancel();
      else flush();
      loadId = session.loadId;
      levelId = session.levelId;
      lastWritten = session.game;
      lastMode = { mode: session.game.mode, paused: session.game.paused };
      settled = { kind: 'idle' };
      deps.onStatus(settled);
      return;
    }
    const { game } = session;
    const modeChanged = lastMode?.mode !== game.mode || lastMode.paused !== game.paused;
    lastMode = { mode: game.mode, paused: game.paused };
    if (session.strokeBase) return;
    if (session.game === lastWritten) {
      // Undo back to what is already stored: nothing left to write.
      if (pending) {
        cancel();
        deps.onStatus(settled);
      }
      return;
    }
    if (pending?.game === game) return;
    const wasPending = pending !== null;
    pending = { level: session.level, game };
    if (modeChanged) {
      flush();
      return;
    }
    if (!wasPending) deps.onStatus({ kind: 'pending' });
    if (game.mode === 'running' && !game.paused) {
      // Throttle: keep the first timer instead of restarting it on every tick.
      timer ??= timers.set(flush, runInterval);
      return;
    }
    if (timer !== null) timers.clear(timer);
    timer = timers.set(flush, delay);
  });

  return {
    /** Writes any pending change now (used on page unload). */
    flush,
    dispose() {
      flush();
      unsubscribe();
    },
  };
}

export type Autosave = ReturnType<typeof createAutosave>;
