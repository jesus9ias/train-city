import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  isDiagonal,
  isValidRotation,
  neighbor,
  oppositePort,
  PORTS,
  rotatePort,
  type Port,
} from './ports';

const anyPort = fc.constantFrom(...PORTS);

describe('ports', () => {
  it.each<[Port, Port]>([
    ['N', 'S'],
    ['E', 'W'],
    ['NE', 'SW'],
    ['SE', 'NW'],
  ])('%s is opposite to %s', (a, b) => {
    expect(oppositePort(a)).toBe(b);
    expect(oppositePort(b)).toBe(a);
  });

  it('rotates 90° clockwise N→E→S→W and NE→SE→SW→NW', () => {
    expect(['N', 'E', 'S', 'W'].map((p) => rotatePort(p as Port, 90))).toEqual([
      'E',
      'S',
      'W',
      'N',
    ]);
    expect(['NE', 'SE', 'SW', 'NW'].map((p) => rotatePort(p as Port, 90))).toEqual([
      'SE',
      'SW',
      'NW',
      'NE',
    ]);
  });

  it('rotates 45° from cardinal to diagonal', () => {
    expect(rotatePort('N', 45)).toBe('NE');
    expect(rotatePort('N', -45)).toBe('NW');
  });

  it('rejects rotations that are not multiples of 45°', () => {
    expect(() => rotatePort('N', 30)).toThrow('multiple of 45');
  });

  it('rotating four times by 90° is the identity', () => {
    fc.assert(
      fc.property(anyPort, (p) => {
        expect(rotatePort(rotatePort(rotatePort(rotatePort(p, 90), 90), 90), 90)).toBe(p);
      }),
    );
  });

  it('rotation and opposite commute', () => {
    fc.assert(
      fc.property(anyPort, fc.integer({ min: -8, max: 8 }), (p, k) => {
        expect(oppositePort(rotatePort(p, k * 45))).toBe(rotatePort(oppositePort(p), k * 45));
      }),
    );
  });

  it('leaving through a port and coming back through its opposite returns to the start', () => {
    fc.assert(
      fc.property(anyPort, fc.integer(), fc.integer(), (p, x, y) => {
        expect(neighbor(neighbor({ x, y }, p), oppositePort(p))).toEqual({ x, y });
      }),
    );
  });

  it('diagonal ports reach diagonal neighbors', () => {
    expect(neighbor({ x: 10, y: 10 }, 'NE')).toEqual({ x: 11, y: 9 });
    expect(isDiagonal('NE')).toBe(true);
    expect(isDiagonal('N')).toBe(false);
  });

  it.each([
    [0, false, true],
    [90, false, true],
    [270, false, true],
    [45, false, false],
    [45, true, true],
    [360, false, false],
    [-90, false, false],
    [90.5, true, false],
  ])('rotation %d with diagonals=%s is valid: %s', (deg, diagonals, expected) => {
    expect(isValidRotation(deg, diagonals)).toBe(expected);
  });
});
