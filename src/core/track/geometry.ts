import { isDiagonal, oppositePort, rotatePort, type Port } from '../grid/ports';

/** A point inside a cell in unit coordinates: (0,0) is the top-left corner, (1,1) bottom-right. */
export type UnitPoint = { readonly x: number; readonly y: number };

const PORT_POINTS: Record<Port, UnitPoint> = {
  N: { x: 0.5, y: 0 },
  NE: { x: 1, y: 0 },
  E: { x: 1, y: 0.5 },
  SE: { x: 1, y: 1 },
  S: { x: 0.5, y: 1 },
  SW: { x: 0, y: 1 },
  W: { x: 0, y: 0.5 },
  NW: { x: 0, y: 0 },
};

export const CELL_CENTER: UnitPoint = { x: 0.5, y: 0.5 };

export function portPoint(port: Port): UnitPoint {
  return PORT_POINTS[port];
}

/**
 * The path a route follows inside its cell:
 * - `line` for straight routes (opposite ports), dead ends (port → center) and, until diagonal
 *   pieces get their own geometry in Stage 8, any other port pair;
 * - `arc` for 90° cardinal curves: a quarter circle of radius 0.5 around the shared corner.
 */
export type RouteShape =
  | { kind: 'line'; from: UnitPoint; to: UnitPoint; length: number }
  | {
      kind: 'arc';
      center: UnitPoint;
      radius: number;
      startAngle: number;
      sweep: number;
      length: number;
    };

const distance = (a: UnitPoint, b: UnitPoint) => Math.hypot(b.x - a.x, b.y - a.y);

export function routeShape(from: Port, to: Port | null): RouteShape {
  const a = portPoint(from);
  if (to === null)
    return { kind: 'line', from: a, to: CELL_CENTER, length: distance(a, CELL_CENTER) };

  const b = portPoint(to);
  const isQuarterTurn =
    !isDiagonal(from) &&
    !isDiagonal(to) &&
    (rotatePort(from, 90) === to || rotatePort(from, -90) === to);

  if (!isQuarterTurn || oppositePort(from) === to) {
    return { kind: 'line', from: a, to: b, length: distance(a, b) };
  }

  // The arc's center is the corner shared by both edges, e.g. S + E → SE corner (1, 1).
  const center = { x: a.x === 0.5 ? b.x : a.x, y: a.y === 0.5 ? b.y : a.y };
  const radius = 0.5;
  const startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const endAngle = Math.atan2(b.y - center.y, b.x - center.x);
  let sweep = endAngle - startAngle;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  return { kind: 'arc', center, radius, startAngle, sweep, length: Math.abs(sweep) * radius };
}

/** Length of a route in cell units (1 = one cell side). */
export function routeLength(from: Port, to: Port | null): number {
  return routeShape(from, to).length;
}

/** Point at fraction `t` (0..1) along a route, in unit coordinates. */
export function routePoint(shape: RouteShape, t: number): UnitPoint {
  if (shape.kind === 'line') {
    return {
      x: shape.from.x + (shape.to.x - shape.from.x) * t,
      y: shape.from.y + (shape.to.y - shape.from.y) * t,
    };
  }
  const angle = shape.startAngle + shape.sweep * t;
  return {
    x: shape.center.x + Math.cos(angle) * shape.radius,
    y: shape.center.y + Math.sin(angle) * shape.radius,
  };
}
