import type { TrackPieceDef } from '../../data/schemas/catalogs';
import { FEATURES } from '../constants';
import { isValidRotation } from '../grid/ports';
import { isDrawableRoute } from './geometry';
import { pieceRoutes } from './routes';

/**
 * True when a piece can be placed at a rotation (spec.md §4.4): a grid rotation (45° steps only
 * with diagonals on) at which every route is drawable. Platform tracks stay in 90° steps.
 */
export function canPlaceAt(
  piece: TrackPieceDef,
  rotation: number,
  diagonals: boolean = FEATURES.diagonals,
): boolean {
  if (!isValidRotation(rotation, diagonals)) return false;
  if (rotation % 90 !== 0 && piece.isStation) return false;
  return pieceRoutes(piece, rotation).every(([from, to]) => isDrawableRoute(from, to));
}

/** How far R turns this piece: 45° when it can be drawn diagonally, else 90°. */
export function rotationStep(
  piece: TrackPieceDef,
  diagonals: boolean = FEATURES.diagonals,
): 45 | 90 {
  return diagonals && canPlaceAt(piece, 45, diagonals) ? 45 : 90;
}

/** The rotation itself when the piece allows it, else the previous allowed one. */
export function snapRotation(
  piece: TrackPieceDef,
  rotation: number,
  diagonals: boolean = FEATURES.diagonals,
): number {
  for (let back = 0; back < 360; back += 45) {
    const candidate = (((rotation - back) % 360) + 360) % 360;
    if (canPlaceAt(piece, candidate, diagonals)) return candidate;
  }
  return 0;
}
