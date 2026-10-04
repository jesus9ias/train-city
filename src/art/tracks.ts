import { CELL_SIZE } from '../core/constants';
import { routePoint, routeShape, type RouteShape } from '../core/track/geometry';
import { activeRouteIndex, pieceRoutes } from '../core/track/routes';
import type { TrackPieceDef } from '../data/schemas/catalogs';
import { PixelCanvas } from './canvas';

/** Point and unit normal (in pixels) at fraction t along a route shape. */
function frameAt(shape: RouteShape, t: number) {
  const eps = 0.01;
  const a = routePoint(shape, Math.max(0, t - eps));
  const b = routePoint(shape, Math.min(1, t + eps));
  const p = routePoint(shape, t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { p: { x: p.x * CELL_SIZE, y: p.y * CELL_SIZE }, n: { x: -dy / len, y: dx / len } };
}

/**
 * One piece in one switch state, unrotated (rotation is applied at runtime in 90° steps, which
 * is lossless for pixel art). Sleepers under every route, then rails; the active route of a
 * switch is drawn last and brighter.
 */
export function drawTrack(piece: TrackPieceDef, state: number): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  const routes = pieceRoutes(piece, 0);
  const active = activeRouteIndex(piece, state);
  const order = routes.map((_, i) => i).sort((a, b) => Number(a === active) - Number(b === active));
  const shapes = order.flatMap((index) => {
    const route = routes[index];
    return route ? [{ index, route, shape: routeShape(route[0], route[1]) }] : [];
  });

  for (const { shape } of shapes) {
    const spacing = 4 / (shape.length * CELL_SIZE);
    for (let t = spacing / 2; t < 1; t += spacing) {
      const { p, n } = frameAt(shape, t);
      for (let s = -6; s <= 6; s += 0.5) c.set(p.x + n.x * s, p.y + n.y * s, 'bark');
      c.set(p.x + n.x * 6, p.y + n.y * 6 + 1, 'plum');
    }
  }
  for (const { index, route, shape } of shapes) {
    const isActive = index === active || !piece.stateful;
    const count = Math.max(8, Math.ceil(shape.length * CELL_SIZE * 3));
    for (let k = 0; k <= count; k++) {
      const { p, n } = frameAt(shape, k / count);
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
  if (piece.stateful) {
    // Lever lamp beside the trunk: green on the default route, amber otherwise.
    const lamp = state === (piece.defaultState ?? 0) ? 'lime' : 'amber';
    c.rect(1, CELL_SIZE - 4, 3, 3, 'black');
    c.set(2, CELL_SIZE - 3, lamp);
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

/** Frames `<piece>_<state>` (one per switch state) plus `platform_0`. */
export function trackFrames(pieces: readonly TrackPieceDef[]): Map<string, PixelCanvas> {
  const frames = new Map<string, PixelCanvas>();
  for (const piece of pieces) {
    const states = piece.stateful ? piece.routes.length : 1;
    for (let state = 0; state < states; state++) {
      frames.set(`${piece.id}_${state}`, drawTrack(piece, state));
    }
  }
  frames.set('platform_0', platform());
  return frames;
}
