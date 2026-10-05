import { isDiagonal, rotatePort, type Port } from '../grid/ports';

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
 * - `line` for straight routes (opposite ports) and dead ends (port → center);
 * - `arc` for 90° cardinal curves: a quarter circle of radius 0.5 around the shared corner;
 * - `cubic` for 45° turns between an edge midpoint and a corner (Stage 8): a cubic Bézier
 *   tangent to both ports' directions, walked by arc length.
 * Other port pairs are not drawable (spec.md §4.4) and fall back to a `line`.
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
    }
  | {
      kind: 'cubic';
      points: CubicPoints;
      /** Cumulative length at CUBIC_SAMPLES + 1 evenly spaced parameter values. */
      lengths: readonly number[];
      length: number;
    };

const distance = (a: UnitPoint, b: UnitPoint) => Math.hypot(b.x - a.x, b.y - a.y);

/** Steps of 45° from one port to another, clockwise (0..7). */
function stepsBetween(from: Port, to: Port): number {
  for (let i = 0; i < 8; i++) if (rotatePort(from, i * 45) === to) return i;
  return 0;
}

/**
 * True for routes the game can draw and drive (spec.md §4.4): straight, dead end, 90° curve
 * between cardinal ports, or a 45° turn between an edge midpoint and a corner.
 */
export function isDrawableRoute(from: Port, to: Port | null): boolean {
  if (to === null) return true;
  const steps = stepsBetween(from, to);
  if (steps === 4) return true;
  if (steps === 2 || steps === 6) return !isDiagonal(from) && !isDiagonal(to);
  return steps === 3 || steps === 5;
}

/** Unit vector from the cell center towards a port. */
function outward(port: Port): UnitPoint {
  const p = portPoint(port);
  const d = distance(CELL_CENTER, p);
  return { x: (p.x - CELL_CENTER.x) / d, y: (p.y - CELL_CENTER.y) / d };
}

const CUBIC_SAMPLES = 64;

type CubicPoints = readonly [UnitPoint, UnitPoint, UnitPoint, UnitPoint];

function cubicAt([p0, p1, p2, p3]: CubicPoints, u: number): UnitPoint {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const c = 3 * v * u * u;
  const d = u * u * u;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

function cubicShape(from: Port, to: Port): RouteShape {
  const a = portPoint(from);
  const b = portPoint(to);
  const inward = outward(from);
  const out = outward(to);
  const k = distance(a, b) / 3;
  const points: CubicPoints = [
    a,
    { x: a.x - inward.x * k, y: a.y - inward.y * k },
    { x: b.x - out.x * k, y: b.y - out.y * k },
    b,
  ];
  const lengths = [0];
  let previous = a;
  for (let i = 1; i <= CUBIC_SAMPLES; i++) {
    const point = cubicAt(points, i / CUBIC_SAMPLES);
    lengths.push((lengths[i - 1] ?? 0) + distance(previous, point));
    previous = point;
  }
  return { kind: 'cubic', points, lengths, length: lengths[CUBIC_SAMPLES] ?? 0 };
}

const shapes = new Map<string, RouteShape>();

/** Shape of a route; memoized, since shapes only depend on the two ports. */
export function routeShape(from: Port, to: Port | null): RouteShape {
  const key = `${from}>${to ?? '.'}`;
  let shape = shapes.get(key);
  if (!shape) {
    shape = computeShape(from, to);
    shapes.set(key, shape);
  }
  return shape;
}

function computeShape(from: Port, to: Port | null): RouteShape {
  const a = portPoint(from);
  if (to === null)
    return { kind: 'line', from: a, to: CELL_CENTER, length: distance(a, CELL_CENTER) };

  const b = portPoint(to);
  const steps = stepsBetween(from, to);
  if (steps === 3 || steps === 5) return cubicShape(from, to);
  const isQuarterTurn = (steps === 2 || steps === 6) && !isDiagonal(from) && !isDiagonal(to);
  if (!isQuarterTurn) return { kind: 'line', from: a, to: b, length: distance(a, b) };

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
  if (shape.kind === 'cubic') {
    // Walk by arc length: find the sample interval holding t × length, then interpolate.
    const target = Math.min(Math.max(t, 0), 1) * shape.length;
    const { lengths } = shape;
    let i = 1;
    while (i < lengths.length - 1 && (lengths[i] ?? 0) < target) i++;
    const before = lengths[i - 1] ?? 0;
    const span = (lengths[i] ?? before) - before;
    const local = span > 0 ? (target - before) / span : 0;
    return cubicAt(shape.points, (i - 1 + local) / (lengths.length - 1));
  }
  const angle = shape.startAngle + shape.sweep * t;
  return {
    x: shape.center.x + Math.cos(angle) * shape.radius,
    y: shape.center.y + Math.sin(angle) * shape.radius,
  };
}

/** Where a signal's lamp sits at rotation 0: right of the line, near the guarded exit (N). */
const SIGNAL_LAMP: UnitPoint = { x: 0.85, y: 0.2 };
/** Foot of the signal post at rotation 0. */
const SIGNAL_FOOT: UnitPoint = { x: 0.85, y: 0.45 };

function turnAroundCenter(point: UnitPoint, degrees: number): UnitPoint {
  const a = (degrees * Math.PI) / 180;
  const dx = point.x - CELL_CENTER.x;
  const dy = point.y - CELL_CENTER.y;
  return {
    x: CELL_CENTER.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: CELL_CENTER.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/** Lamp and post foot of a signal placed at `rotation` (clockwise degrees), in unit coordinates. */
export function signalPost(rotation: number): { lamp: UnitPoint; foot: UnitPoint } {
  return {
    lamp: turnAroundCenter(SIGNAL_LAMP, rotation),
    foot: turnAroundCenter(SIGNAL_FOOT, rotation),
  };
}
