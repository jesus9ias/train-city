import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { TrackPieceDef } from '../../data/schemas/catalogs';
import type { Cell } from '../grid/coords';
import { PORTS } from '../grid/ports';
import { isConnected, type TrackAt } from './connectivity';
import { portPoint, routeLength, routePoint, routeShape } from './geometry';
import { activeRouteIndex, pieceRoutes, piecePorts } from './routes';

const piece = (
  def: Partial<TrackPieceDef> & Pick<TrackPieceDef, 'id' | 'routes'>,
): TrackPieceDef => ({
  name: def.id,
  cost: 10,
  ...def,
});

const straight = piece({ id: 'straight', routes: [['N', 'S']] });
const curve = piece({ id: 'curve', routes: [['S', 'E']] });
const sw = piece({
  id: 'switch',
  routes: [
    ['S', 'N'],
    ['S', 'E'],
  ],
  stateful: true,
  trunk: 'S',
  defaultState: 0,
});
const buffer = piece({ id: 'buffer', routes: [['S', null]] });
const pieces = { straight, curve, switch: sw, buffer };

const key = (c: Cell) => `${c.x},${c.y}`;
const lookupOf = (tracks: Record<string, TrackAt>) => (c: Cell) => tracks[key(c)];

describe('Feature: Piece connectivity (core rules)', () => {
  it.each([
    [0, 'S-E'],
    [90, 'W-S'],
    [180, 'N-W'],
    [270, 'E-N'],
  ])('Scenario Outline: Port rotation — curve rotated %d° has route %s', (rot, expected) => {
    const [route] = pieceRoutes(curve, rot);
    expect(route?.join('-')).toBe(expected);
  });

  it('Scenario: Two adjacent pieces are connected', () => {
    const lookup = lookupOf({
      '10,10': { piece: 'straight', rotation: 90 },
      '11,10': { piece: 'straight', rotation: 90 },
    });
    expect(isConnected(lookup, pieces, { x: 10, y: 10 }, 'E')).toBe(true);
    expect(isConnected(lookup, pieces, { x: 11, y: 10 }, 'W')).toBe(true);
  });

  it('pieces that do not face each other are not connected', () => {
    const lookup = lookupOf({
      '10,10': { piece: 'straight', rotation: 0 }, // N-S
      '11,10': { piece: 'straight', rotation: 90 }, // E-W
    });
    expect(isConnected(lookup, pieces, { x: 10, y: 10 }, 'E')).toBe(false);
    expect(isConnected(lookup, pieces, { x: 11, y: 10 }, 'W')).toBe(false);
  });

  it('a port with no neighbor track is not connected', () => {
    const lookup = lookupOf({ '0,0': { piece: 'straight', rotation: 0 } });
    expect(isConnected(lookup, pieces, { x: 0, y: 0 }, 'S')).toBe(false);
    expect(isConnected(lookup, pieces, { x: 5, y: 5 }, 'S')).toBe(false);
  });

  it('connectivity is symmetric for any pair of rotated pieces', () => {
    const rotations = [0, 90, 180, 270];
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(pieces)),
        fc.constantFrom(...rotations),
        fc.constantFrom(...Object.keys(pieces)),
        fc.constantFrom(...rotations),
        fc.constantFrom('N', 'E', 'S', 'W' as const),
        (p1, r1, p2, r2, port) => {
          const a = { x: 5, y: 5 };
          const b = { N: { x: 5, y: 4 }, E: { x: 6, y: 5 }, S: { x: 5, y: 6 }, W: { x: 4, y: 5 } }[
            port
          ];
          const lookup = lookupOf({
            [key(a)]: { piece: p1, rotation: r1 },
            [key(b)]: { piece: p2, rotation: r2 },
          });
          const back = { N: 'S', E: 'W', S: 'N', W: 'E' } as const;
          expect(isConnected(lookup, pieces, a, port)).toBe(
            isConnected(lookup, pieces, b, back[port]),
          );
        },
      ),
    );
  });
});

describe('routes', () => {
  it('lists the ports of a switch once each', () => {
    expect(piecePorts(sw, 0).sort()).toEqual(['E', 'N', 'S']);
  });

  it('ignores the dead end of a buffer stop', () => {
    expect(piecePorts(buffer, 90)).toEqual(['W']);
  });

  it('selects the active route of a stateful piece', () => {
    expect(activeRouteIndex(sw, undefined)).toBe(0);
    expect(activeRouteIndex(sw, 1)).toBe(1);
    expect(activeRouteIndex(sw, 9)).toBe(0);
    expect(activeRouteIndex(straight, 1)).toBe(0);
    expect(activeRouteIndex({ ...sw, defaultState: undefined }, undefined)).toBe(0);
  });
});

describe('geometry', () => {
  it('straight routes have length 1', () => {
    expect(routeLength('N', 'S')).toBe(1);
    expect(routeLength('E', 'W')).toBe(1);
  });

  it('90° curves are quarter circles of radius 0.5', () => {
    expect(routeLength('S', 'E')).toBeCloseTo(Math.PI / 4);
    const shape = routeShape('S', 'E');
    expect(shape.kind).toBe('arc');
    const start = routePoint(shape, 0);
    const end = routePoint(shape, 1);
    expect([start.x, start.y, end.x, end.y].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([
      0.5, 1, 1, 0.5,
    ]);
  });

  it('diagonal straights have length √2', () => {
    expect(routeLength('NE', 'SW')).toBeCloseTo(Math.SQRT2);
  });

  it('dead ends go from the port to the cell center', () => {
    expect(routeLength('S', null)).toBe(0.5);
    expect(routePoint(routeShape('S', null), 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it('every route starts at its first port and ends at its second', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PORTS), fc.constantFrom(...PORTS), (a, b) => {
        fc.pre(a !== b);
        const shape = routeShape(a, b);
        const start = routePoint(shape, 0);
        const end = routePoint(shape, 1);
        expect(start.x).toBeCloseTo(portPoint(a).x);
        expect(start.y).toBeCloseTo(portPoint(a).y);
        expect(end.x).toBeCloseTo(portPoint(b).x);
        expect(end.y).toBeCloseTo(portPoint(b).y);
        expect(shape.length).toBeGreaterThan(0);
      }),
    );
  });

  it('every curve point stays inside the cell', () => {
    for (const [a, b] of [
      ['S', 'E'],
      ['E', 'N'],
      ['N', 'W'],
      ['W', 'S'],
    ] as const) {
      const shape = routeShape(a, b);
      for (let t = 0; t <= 1; t += 0.1) {
        const p = routePoint(shape, t);
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(1 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});
