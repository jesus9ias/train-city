import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { neighbor, oppositePort, type Port } from '../grid/ports';
import { piecePorts } from './routes';

/** Minimal view of a placed track needed for connectivity checks. */
export type TrackAt = { readonly piece: string; readonly rotation: number };

export type TrackLookup = (cell: Cell) => TrackAt | undefined;

/** True if the track at `cell` uses `port`. */
export function usesPort(
  lookup: TrackLookup,
  pieces: Readonly<Record<string, TrackPieceDef>>,
  cell: Cell,
  port: Port,
): boolean {
  const track = lookup(cell);
  const piece = track && pieces[track.piece];
  return (
    piece !== undefined && track !== undefined && piecePorts(piece, track.rotation).includes(port)
  );
}

/**
 * True if the track at `cell` connects through `port` to a track in the neighboring cell that
 * uses the opposite port.
 */
export function isConnected(
  lookup: TrackLookup,
  pieces: Readonly<Record<string, TrackPieceDef>>,
  cell: Cell,
  port: Port,
): boolean {
  return (
    usesPort(lookup, pieces, cell, port) &&
    usesPort(lookup, pieces, neighbor(cell, port), oppositePort(port))
  );
}
