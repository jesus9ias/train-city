import { CELL_SIZE } from '../core/constants';
import { isDiagonal } from '../core/grid/ports';
import { routePoint, routeShape, signalPost, type RouteShape } from '../core/track/geometry';
import { activeRouteIndex, pieceRoutes } from '../core/track/routes';
import { rotationStep } from '../core/track/rotation';
import type { TrackPieceDef } from '../data/schemas/catalogs';
import { PixelCanvas } from './canvas';

/**
 * Track frames are a little larger than a cell and drawn centered on it: diagonal rails reach a
 * corner, and their outer rail and sleepers continue past it so neighbors join seamlessly.
 */
export const TRACK_PADDING = 5;
const SIZE = CELL_SIZE + TRACK_PADDING * 2;
/** How far (px) rails and sleepers continue past a corner port. */
const CORNER_OVERHANG = 4;

/** Point and unit normal (in frame pixels) at fraction t along a route shape. */
function frameAt(shape: RouteShape, t: number) {
  const eps = 0.01;
  const a = routePoint(shape, Math.max(0, t - eps));
  const b = routePoint(shape, Math.min(1, t + eps));
  const p = routePoint(shape, Math.min(1, Math.max(0, t)));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  // Beyond either end, continue straight along the end tangent.
  const beyond = (t < 0 ? t : t > 1 ? t - 1 : 0) * shape.length * CELL_SIZE;
  return {
    p: {
      x: p.x * CELL_SIZE + tx * beyond + TRACK_PADDING,
      y: p.y * CELL_SIZE + ty * beyond + TRACK_PADDING,
    },
    n: { x: -ty, y: tx },
  };
}

/**
 * One piece in one switch state at rotation 0 or 45° (the renderer adds 90° steps, which are
 * lossless). Sleepers under every route, then rails; the active route of a switch is drawn last
 * and brighter.
 */
export function drawTrack(piece: TrackPieceDef, state: number, rotation: 0 | 45 = 0): PixelCanvas {
  const c = new PixelCanvas(SIZE, SIZE);
  const routes = pieceRoutes(piece, rotation);
  const active = activeRouteIndex(piece, state);
  const order = routes.map((_, i) => i).sort((a, b) => Number(a === active) - Number(b === active));
  const shapes = order.flatMap((index) => {
    const route = routes[index];
    if (!route) return [];
    const shape = routeShape(route[0], route[1]);
    const px = shape.length * CELL_SIZE;
    // Corner ends overhang a little; edge ends stop at the cell edge.
    const start = isDiagonal(route[0]) ? -CORNER_OVERHANG / px : 0;
    const end = route[1] !== null && isDiagonal(route[1]) ? 1 + CORNER_OVERHANG / px : 1;
    return [{ index, route, shape, start, end }];
  });

  for (const { shape, start, end } of shapes) {
    const spacing = 4 / (shape.length * CELL_SIZE);
    for (let t = start + spacing / 2; t < end; t += spacing) {
      const { p, n } = frameAt(shape, t);
      for (let s = -6; s <= 6; s += 0.5) c.set(p.x + n.x * s, p.y + n.y * s, 'bark');
      c.set(p.x + n.x * 6, p.y + n.y * 6 + 1, 'plum');
    }
  }
  for (const { index, route, shape, start, end } of shapes) {
    const isActive = index === active || !piece.stateful;
    const count = Math.max(8, Math.ceil(shape.length * CELL_SIZE * 3));
    for (let k = 0; k <= count; k++) {
      const { p, n } = frameAt(shape, start + ((end - start) * k) / count);
      for (const side of [-4, 4]) {
        c.set(p.x + n.x * side, p.y + n.y * side + 1, 'ink');
        c.set(p.x + n.x * side, p.y + n.y * side, isActive ? 'silver' : 'slate');
      }
    }
    if (route[1] === null) {
      // Buffer stop: a red beam across the track at the cell center.
      const { p, n } = frameAt(shape, 1);
      const tangent = { x: n.y, y: -n.x };
      for (let s = -6; s <= 6; s += 0.5) {
        for (const d of [0, -1]) {
          c.set(p.x + n.x * s + tangent.x * d, p.y + n.y * s + tangent.y * d, 'red');
        }
        c.set(p.x + n.x * s + tangent.x, p.y + n.y * s + tangent.y, 'wine');
      }
    }
  }
  if (piece.signal !== undefined) {
    // Signal post beside the line; the lit lamp is drawn on top at run time (ui atlas).
    const { lamp, foot } = signalPost(rotation);
    const at = (u: number) => TRACK_PADDING + u * CELL_SIZE;
    for (let k = 0; k <= 8; k++) {
      const x = at(foot.x + ((lamp.x - foot.x) * k) / 8);
      const y = at(foot.y + ((lamp.y - foot.y) * k) / 8);
      c.set(x, y + 1, 'black');
      c.set(x, y, 'ink');
    }
    const x = Math.floor(at(lamp.x)) - 1;
    const y = Math.floor(at(lamp.y)) - 1;
    c.rect(x - 1, y - 1, 5, 5, 'black');
    c.rect(x, y, 3, 3, 'night');
  }
  if (piece.stateful) {
    // Lever lamp in a corner of the cell: green on the default route, amber otherwise.
    const lamp = state === (piece.defaultState ?? 0) ? 'lime' : 'amber';
    const x = TRACK_PADDING + 1;
    const y = TRACK_PADDING + CELL_SIZE - 4;
    c.rect(x, y, 3, 3, 'black');
    c.set(x + 1, y + 1, lamp);
  }
  return c;
}

/** Station platform under a vertical platform track (rotate 90° for horizontal stations). */
function platform(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  c.rect(0, 0, CELL_SIZE, CELL_SIZE, 'silver');
  for (let y = 0; y < CELL_SIZE; y += 5) c.rect(0, y, CELL_SIZE, 1, 'steel');
  for (const x of [0, CELL_SIZE - 1]) c.rect(x, 0, 1, CELL_SIZE, 'slate');
  for (const x of [1, CELL_SIZE - 2]) {
    for (let y = 0; y < CELL_SIZE; y += 2) c.set(x, y, 'yellow'); // safety line
  }
  return c;
}

/**
 * Frames `<piece>_<state>` (one per switch state), plus `<piece>_<state>_d` drawn at 45° for
 * pieces that rotate in 45° steps, plus `platform_0`.
 */
export function trackFrames(pieces: readonly TrackPieceDef[]): Map<string, PixelCanvas> {
  const frames = new Map<string, PixelCanvas>();
  for (const piece of pieces) {
    const states = piece.stateful ? piece.routes.length : 1;
    const diagonal = rotationStep(piece) === 45;
    for (let state = 0; state < states; state++) {
      frames.set(`${piece.id}_${state}`, drawTrack(piece, state));
      if (diagonal) frames.set(`${piece.id}_${state}_d`, drawTrack(piece, state, 45));
    }
  }
  frames.set('platform_0', platform());
  return frames;
}
