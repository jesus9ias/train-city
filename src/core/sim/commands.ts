import type { GameState, RulesContext } from '../game/state';
import type { Cell } from '../grid/coords';
import { sameCell, trackAt } from '../world/world';
import { trainAt } from './placement';

export const RUN_REASONS = {
  notASwitch: 'Not a switch',
  switchOccupied: 'Switch occupied',
  noTrain: 'No such train',
} as const;

export type RunOutcome =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: string };

/** Flips a switch or wye to its next route; only when no train is on it (spec.md §4.4 rule 7). */
export function flipSwitch(state: GameState, { catalogs }: RulesContext, cell: Cell): RunOutcome {
  const track = trackAt(state.world, cell);
  const piece = track && catalogs.pieces[track.piece];
  if (!track || !piece?.stateful) return { ok: false, reason: RUN_REASONS.notASwitch };
  if (trainAt(state.trains, cell)) return { ok: false, reason: RUN_REASONS.switchOccupied };
  const flipped = { ...track, state: (track.state + 1) % piece.routes.length };
  return {
    ok: true,
    state: {
      ...state,
      world: {
        ...state.world,
        tracks: state.world.tracks.map((t) => (sameCell(t.at, cell) ? flipped : t)),
      },
    },
  };
}

/** Starts or stops a train. A blocked train stays blocked until the way ahead is clear. */
export function setTrainRunning(state: GameState, trainId: string, running: boolean): RunOutcome {
  if (!state.trains.some((t) => t.id === trainId))
    return { ok: false, reason: RUN_REASONS.noTrain };
  return {
    ok: true,
    state: {
      ...state,
      trains: state.trains.map((t) => (t.id === trainId ? { ...t, running } : t)),
    },
  };
}

/** Leaving the editor starts a new editor session (spec.md §6.1). */
export function enterRunMode(state: GameState): GameState {
  if (state.mode === 'running') return state;
  return { ...state, mode: 'running', paused: false, editorSession: state.editorSession + 1 };
}

/** Editor Mode pauses the simulation but keeps the whole run state (spec.md §5.2). */
export function enterEditorMode(state: GameState): GameState {
  return state.mode === 'editing' ? state : { ...state, mode: 'editing' };
}

export function setPaused(state: GameState, paused: boolean): GameState {
  return state.paused === paused ? state : { ...state, paused };
}
