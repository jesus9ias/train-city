import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { CARDINAL_PORTS, neighbor, oppositePort, rotatePort, type Port } from '../grid/ports';
import { cellKey, inBounds, trackAt, type WorldState } from '../world/world';
import { entryFor } from './routing';
import type { CellPass, TrainState } from './train';

export const TRAIN_DOES_NOT_FIT = 'Train does not fit on the track';

export type TrainLayout =
  | { readonly ok: true; readonly head: CellPass; readonly trail: readonly CellPass[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Lays a train on the track: the locomotive on `cell` heading out through `facing`, and one
 * wagon per cell behind it, following the track backwards (spec.md §6.1).
 */
export function layoutTrain(
  world: WorldState,
  pieces: Readonly<Record<string, TrackPieceDef>>,
  cell: Cell,
  facing: Port,
  wagonCount: number,
): TrainLayout {
  const passFor = (at: Cell, exit: Port): CellPass | null => {
    if (!inBounds(world, at)) return null;
    const track = trackAt(world, at);
    const piece = track && pieces[track.piece];
    if (!track || !piece) return null;
    const entry = entryFor(piece, track.rotation, track.state, exit);
    return entry === undefined ? null : { cell: at, entry, exit };
  };

  const head = passFor(cell, facing);
  if (!head) return { ok: false, reason: TRAIN_DOES_NOT_FIT };
  const seen = new Set([cellKey(cell)]);
  const trail: CellPass[] = [];
  let current = head;
  for (let i = 0; i < wagonCount; i++) {
    const behind = neighbor(current.cell, current.entry);
    const pass = passFor(behind, oppositePort(current.entry));
    if (!pass || seen.has(cellKey(pass.cell))) return { ok: false, reason: TRAIN_DOES_NOT_FIT };
    seen.add(cellKey(pass.cell));
    trail.push(pass);
    current = pass;
  }
  return { ok: true, head, trail };
}

/**
 * Tries `preferred` first, then the other directions clockwise, so pressing R cycles through
 * the directions the track actually allows.
 */
export function layoutTrainFacing(
  world: WorldState,
  pieces: Readonly<Record<string, TrackPieceDef>>,
  cell: Cell,
  preferred: Port,
  wagonCount: number,
): TrainLayout {
  let first: TrainLayout | null = null;
  for (let i = 0; i < CARDINAL_PORTS.length; i++) {
    const layout = layoutTrain(world, pieces, cell, rotatePort(preferred, i * 90), wagonCount);
    if (layout.ok) return layout;
    first ??= layout;
  }
  return first ?? { ok: false, reason: TRAIN_DOES_NOT_FIT };
}

/** Facing port for an editor rotation: 0° → N, 90° → E, 180° → S, 270° → W. */
export function facingFromRotation(rotation: number): Port {
  return rotatePort('N', Math.round(rotation / 90) * 90);
}

export function trainAt(trains: readonly TrainState[], cell: Cell): TrainState | undefined {
  return trains.find(
    (t) =>
      (t.head.cell.x === cell.x && t.head.cell.y === cell.y) ||
      t.trail.some((p) => p.cell.x === cell.x && p.cell.y === cell.y),
  );
}

export function occupiedCells(trains: readonly TrainState[]): Set<string> {
  const keys = new Set<string>();
  for (const train of trains) {
    keys.add(cellKey(train.head.cell));
    for (const pass of train.trail) keys.add(cellKey(pass.cell));
  }
  return keys;
}
