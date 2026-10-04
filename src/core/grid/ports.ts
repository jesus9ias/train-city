import type { Cell } from './coords';

/**
 * Connection points of a cell, in clockwise order starting at the top edge. Cardinal ports sit at
 * edge midpoints, diagonal ports at corners. Each step in this list is a 45° rotation.
 */
export const PORTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Port = (typeof PORTS)[number];

export const CARDINAL_PORTS = ['N', 'E', 'S', 'W'] as const satisfies readonly Port[];
export const DIAGONAL_PORTS = ['NE', 'SE', 'SW', 'NW'] as const satisfies readonly Port[];

const NEXT_CLOCKWISE: Record<Port, Port> = {
  N: 'NE',
  NE: 'E',
  E: 'SE',
  SE: 'S',
  S: 'SW',
  SW: 'W',
  W: 'NW',
  NW: 'N',
};

const OFFSETS: Record<Port, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  NE: { dx: 1, dy: -1 },
  E: { dx: 1, dy: 0 },
  SE: { dx: 1, dy: 1 },
  S: { dx: 0, dy: 1 },
  SW: { dx: -1, dy: 1 },
  W: { dx: -1, dy: 0 },
  NW: { dx: -1, dy: -1 },
};

export function isDiagonal(port: Port): boolean {
  return (DIAGONAL_PORTS as readonly Port[]).includes(port);
}

/** True for rotations allowed on the grid: multiples of 90°, or of 45° when diagonals are on. */
export function isValidRotation(degrees: number, diagonals: boolean): boolean {
  const step = diagonals ? 45 : 90;
  return Number.isInteger(degrees) && degrees >= 0 && degrees < 360 && degrees % step === 0;
}

/** Rotates a port clockwise by a multiple of 45° (negative values rotate counter-clockwise). */
export function rotatePort(port: Port, degrees: number): Port {
  if (!Number.isInteger(degrees) || degrees % 45 !== 0) {
    throw new Error(`Rotation must be a multiple of 45°, got ${degrees}`);
  }
  const steps = (((degrees / 45) % 8) + 8) % 8;
  let result = port;
  for (let i = 0; i < steps; i++) result = NEXT_CLOCKWISE[result];
  return result;
}

export function oppositePort(port: Port): Port {
  return rotatePort(port, 180);
}

/** The cell reached by leaving `cell` through `port`. Its matching port is `oppositePort(port)`. */
export function neighbor(cell: Cell, port: Port): Cell {
  const { dx, dy } = OFFSETS[port];
  return { x: cell.x + dx, y: cell.y + dy };
}
