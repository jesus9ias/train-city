import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { neighbor, oppositePort, PORTS, type Port } from '../grid/ports';
import { canPlaceAt } from '../track/rotation';
import { pieceRoutes } from '../track/routes';

/** Unit step of each heading. */
const OFFSETS = Object.fromEntries(
  PORTS.map((p) => {
    const n = neighbor({ x: 0, y: 0 }, p);
    return [p, { dx: n.x, dy: n.y }];
  }),
) as Record<Port, { dx: number; dy: number }>;

/** A position in cell units: cell (x, y) covers [x, x + 1) × [y, y + 1). */
export type GridPoint = { readonly x: number; readonly y: number };

export type PieceFit = { readonly piece: string; readonly rotation: number };

/** A piece with one through route and no special role: straights and curves. */
function isPlain(piece: TrackPieceDef): boolean {
  const [route] = piece.routes;
  return (
    piece.routes.length === 1 &&
    route?.[1] !== null &&
    !piece.stateful &&
    !piece.isStation &&
    piece.signal === undefined
  );
}

/** Pieces whose tool draws lines by dragging: a plain piece running straight across the cell. */
export function isLinePiece(piece: TrackPieceDef): boolean {
  const [route] = piece.routes;
  return isPlain(piece) && route !== undefined && route[1] === oppositePort(route[0]);
}

/** The heading from the center of `cell` towards `point`, snapped to the nearest of 8. */
export function headingTowards(cell: Cell, point: GridPoint): Port {
  const dx = point.x - (cell.x + 0.5);
  const dy = point.y - (cell.y + 0.5);
  // Clockwise from north, as PORTS: 0 = N, 1 = NE, …
  const sector = Math.round(Math.atan2(dx, -dy) / (Math.PI / 4));
  return PORTS[((sector % 8) + 8) % 8] as Port;
}

export function isInCell(cell: Cell, point: GridPoint): boolean {
  return Math.floor(point.x) === cell.x && Math.floor(point.y) === cell.y;
}

/** How far (cells) the pointer may stray sideways from a line before it turns. */
const LANE_HALF_WIDTH = 0.9;
/** Cardinal headings win within this angle; diagonals take the rest (drags are rarely exact). */
const CARDINAL_BIAS_DEGREES = 30;
/** The first heading of a line is chosen once the pointer is this far (cells) from the click. */
const FIRST_STEP_DISTANCE = 2;

/** Snaps a vector to 8 headings, preferring the cardinal ones. */
function snapBiased(dx: number, dy: number): Port {
  const degrees = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  const cardinal = Math.round(degrees / 90) % 4;
  const offCardinal = Math.abs(degrees - cardinal * 90);
  const off = Math.min(offCardinal, 360 - offCardinal);
  if (off <= CARDINAL_BIAS_DEGREES) return PORTS[cardinal * 2] as Port;
  return PORTS[(Math.floor(degrees / 90) * 2 + 1) % 8] as Port;
}

/**
 * Where a line whose head is `head` (entered with `heading`, null for the first cell) should
 * step next to follow `point`, or null to stay put. A line keeps its heading while the pointer
 * moves ahead within its lane, so a shaky straight drag stays straight; otherwise it turns
 * towards the pointer. When `final` (pointer released), any point outside the head cell counts.
 */
export function nextHeading(
  head: Cell,
  heading: Port | null,
  point: GridPoint,
  final = false,
): Port | null {
  const dx = point.x - (head.x + 0.5);
  const dy = point.y - (head.y + 0.5);
  const reach = heading === null ? FIRST_STEP_DISTANCE : 1;
  if (final ? isInCell(head, point) : Math.hypot(dx, dy) < reach) return null;
  if (heading !== null) {
    const { dx: hx, dy: hy } = OFFSETS[heading];
    const length = Math.hypot(hx, hy);
    const forward = (dx * hx + dy * hy) / length;
    const sideways = Math.abs(dx * hy - dy * hx) / length;
    if (forward > 0 && sideways < LANE_HALF_WIDTH) return heading;
  }
  return snapBiased(dx, dy);
}

/**
 * The first allowed plain piece and rotation (in catalog order, smallest rotation first) whose
 * route joins ports `a` and `b`, or null when no allowed piece can draw that route.
 */
export function pieceForRoute(
  pieces: Readonly<Record<string, TrackPieceDef>>,
  allowed: readonly string[] | undefined,
  a: Port,
  b: Port,
): PieceFit | null {
  if (a === b) return null;
  for (const piece of Object.values(pieces)) {
    if (!isPlain(piece) || (allowed !== undefined && !allowed.includes(piece.id))) continue;
    for (let rotation = 0; rotation < 360; rotation += 45) {
      if (!canPlaceAt(piece, rotation)) continue;
      const [route] = pieceRoutes(piece, rotation);
      if (route && ((route[0] === a && route[1] === b) || (route[0] === b && route[1] === a))) {
        return { piece: piece.id, rotation };
      }
    }
  }
  return null;
}
