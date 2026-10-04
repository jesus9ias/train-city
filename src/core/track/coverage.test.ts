import { describe, expect, it } from 'vitest';
import { testCatalogs } from '../../test/fixtures';
import { DIAGONAL_PORTS, isDiagonal, oppositePort, PORTS, type Port } from '../grid/ports';
import { canPlaceAt } from './rotation';
import { pieceRoutes, type WorldRoute } from './routes';

/** How a train entering through `entry` turns when it leaves through `exit`. */
function turn(entry: Port, exit: Port): string {
  const heading = PORTS.indexOf(oppositePort(entry));
  const steps = (((PORTS.indexOf(exit) - heading) % 8) + 8) % 8;
  return ({ 0: 'straight', 1: 'R45', 2: 'R90', 6: 'L90', 7: 'L45' } as const)[steps] ?? 'other';
}

/** Every piece of the bundled catalog at every rotation it accepts. */
const placements: { id: string; stateful: boolean; routes: WorldRoute[] }[] = Object.values(
  testCatalogs.pieces,
).flatMap((piece) =>
  [0, 45, 90, 135, 180, 225, 270, 315]
    .filter((r) => canPlaceAt(piece, r))
    .map((r) => ({
      id: piece.id,
      stateful: piece.stateful ?? false,
      routes: pieceRoutes(piece, r),
    })),
);

/** Turns available to a train travelling towards `heading`. */
function turnsFrom(heading: Port): Set<string> {
  const turns = new Set<string>();
  for (const { routes } of placements) {
    for (const [a, b] of routes) {
      if (b === null) continue;
      if (oppositePort(a) === heading) turns.add(turn(a, b));
      if (oppositePort(b) === heading) turns.add(turn(b, a));
    }
  }
  return turns;
}

/** Branch pairs a switch or wye offers to a train travelling towards `heading`. */
function branchesFrom(heading: Port): Set<string> {
  const options = new Set<string>();
  for (const { stateful, routes } of placements) {
    const trunk = routes[0]?.[0];
    if (!stateful || !trunk || oppositePort(trunk) !== heading) continue;
    options.add(
      routes
        .map(([, to]) => (to ? turn(trunk, to) : 'end'))
        .sort()
        .join('/'),
    );
  }
  return options;
}

const isCardinalLine = ([a, b]: WorldRoute) =>
  b !== null && oppositePort(a) === b && !isDiagonal(a);
const isDiagonalLine = ([a, b]: WorldRoute) => b !== null && oppositePort(a) === b && isDiagonal(a);

describe('Feature: Diagonal tracks — catalog coverage (spec.md §4.4, D12)', () => {
  it.each(PORTS)('from heading %s: straight and 45° turns both ways', (heading) => {
    const turns = turnsFrom(heading);
    for (const needed of ['straight', 'L45', 'R45']) expect(turns, needed).toContain(needed);
    if (!isDiagonal(heading)) {
      expect(turns).toContain('L90');
      expect(turns).toContain('R90');
    }
  });

  it.each(PORTS)('from heading %s: switches to both sides and a wye', (heading) => {
    const options = branchesFrom(heading);
    const branchesLeft = [...options].some(
      (o) => o.split('/').includes('straight') && o.includes('L'),
    );
    const branchesRight = [...options].some(
      (o) => o.split('/').includes('straight') && o.includes('R'),
    );
    const wye = [...options].some(
      (o) => !o.includes('straight') && o.includes('L') && o.includes('R'),
    );
    expect(branchesLeft, `left switch from ${heading}`).toBe(true);
    expect(branchesRight, `right switch from ${heading}`).toBe(true);
    expect(wye, `wye from ${heading}`).toBe(true);
  });

  it('every kind of line can cross every other kind', () => {
    const crossings = placements
      .filter((p) => !p.stateful && p.routes.length === 2)
      .map(({ routes: [a, b] }) => (a && b ? [a, b] : []));
    const has = (first: (r: WorldRoute) => boolean, second: (r: WorldRoute) => boolean) =>
      crossings.some(([a, b]) => a && b && ((first(a) && second(b)) || (first(b) && second(a))));
    expect(has(isCardinalLine, isCardinalLine)).toBe(true);
    expect(has(isDiagonalLine, isDiagonalLine)).toBe(true);
    expect(has(isCardinalLine, isDiagonalLine)).toBe(true);
    // Each diagonal direction can cross each cardinal one.
    for (const corner of DIAGONAL_PORTS) {
      for (const edge of ['N', 'E'] as const) {
        const found = crossings.some(
          ([a, b]) =>
            [a, b].some((r) => r && (r[0] === corner || r[1] === corner)) &&
            [a, b].some((r) => r && (r[0] === edge || r[1] === edge)),
        );
        expect(found, `${corner} × ${edge}`).toBe(true);
      }
    }
  });
});
