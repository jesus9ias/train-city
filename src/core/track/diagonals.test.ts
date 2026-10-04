import { describe, expect, it } from 'vitest';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { LevelInput } from '../../data/schemas/level';
import { makeGame, makeLevel, testCatalogs } from '../../test/fixtures';
import { applyAction, REASONS } from '../editor/actions';
import type { Cell } from '../grid/coords';
import { isDiagonal, PORTS } from '../grid/ports';
import { enterRunMode, setTrainRunning } from '../sim/commands';
import { facingOf, trainPoses } from '../sim/facing';
import { exitFor } from '../sim/routing';
import { advance } from '../sim/step';
import { isConnected, type TrackAt } from './connectivity';
import { isDrawableRoute, routeLength, routePoint, routeShape } from './geometry';
import { canPlaceAt, rotationStep, snapRotation } from './rotation';

type TrackInput = NonNullable<LevelInput['map']['tracks']>[number];
const at = (x: number, y: number) => ({ x, y });
const pieceOf = (id: string) => {
  const piece = testCatalogs.pieces[id];
  if (!piece) throw new Error(`missing piece ${id}`);
  return piece;
};

/** Same catalogs, but locomotives reach full speed instantly. */
const instant: Catalogs = {
  ...testCatalogs,
  locomotives: Object.fromEntries(
    Object.entries(testCatalogs.locomotives).map(([id, l]) => [id, { ...l, acceleration: 1e9 }]),
  ),
};

function game(tracks: TrackInput[]) {
  const { state, ctx } = makeGame(
    makeLevel({ tracks }, { economy: { initialMoney: null, fuelPrice: 0.5 } }),
  );
  return { state, ctx: { ...ctx, catalogs: instant } };
}

function lookup(tracks: { at: Cell; piece: string; rotation: number }[]) {
  return (cell: Cell): TrackAt | undefined =>
    tracks.find((t) => t.at.x === cell.x && t.at.y === cell.y);
}

describe('Feature: Diagonal tracks', () => {
  it('Scenario: Diagonal straight connects corner to corner', () => {
    // A straight at 45° runs NE–SW.
    const tracks = [
      { at: at(10, 10), piece: 'straight', rotation: 45 },
      { at: at(11, 9), piece: 'straight', rotation: 45 },
      { at: at(11, 10), piece: 'straight', rotation: 0 },
      { at: at(10, 9), piece: 'straight', rotation: 90 },
    ];
    const find = lookup(tracks);
    expect(isConnected(find, testCatalogs.pieces, at(10, 10), 'NE')).toBe(true);
    expect(isConnected(find, testCatalogs.pieces, at(11, 9), 'SW')).toBe(true);
    // Never to the orthogonal cells that share the corner.
    expect(isConnected(find, testCatalogs.pieces, at(10, 10), 'E')).toBe(false);
    expect(isConnected(find, testCatalogs.pieces, at(10, 10), 'N')).toBe(false);
  });

  it('Scenario: Diagonal crossing through a shared corner', () => {
    const find = lookup([
      { at: at(10, 10), piece: 'straight', rotation: 45 }, // NE–SW
      { at: at(11, 10), piece: 'straight', rotation: 135 }, // SE–NW
    ]);
    for (const port of PORTS) {
      expect(isConnected(find, testCatalogs.pieces, at(10, 10), port)).toBe(false);
    }
  });

  it('Scenario: Diagonal distance', () => {
    // A diagonal line from (5,25) up to (25,5), running NE.
    const tracks: TrackInput[] = Array.from({ length: 21 }, (_, i) => ({
      at: at(5 + i, 25 - i),
      piece: 'straight',
      rotation: 45,
    }));
    const { state, ctx } = game(tracks);
    const placed = applyAction(state, ctx, {
      type: 'placeTrain',
      cell: at(6, 24),
      locomotive: 'loco_steam', // maxSpeed 2
      wagons: [],
      facing: 'NE',
    });
    if (!placed.ok) throw new Error(placed.reason);
    const started = setTrainRunning(enterRunMode(placed.state), 't1', true);
    if (!started.ok) throw new Error(started.reason);
    const before = started.state.trains[0];
    const after = advance(started.state, ctx, 20).state.trains[0]; // 1 second
    if (!before || !after) throw new Error('no train');

    // 2 distance units travelled; each diagonal cell is √2 units long.
    const cellsMoved = after.head.cell.x - before.head.cell.x;
    const travelled = cellsMoved * Math.SQRT2 + after.progress - before.progress;
    expect(travelled).toBeCloseTo(2, 6);
    expect(travelled / Math.SQRT2).toBeCloseTo(1.41, 2);
    expect(trainPoses(after)[0]?.facing).toBe('NE');
  });

  it('Scenario: A 45° curve joins a cardinal line to a diagonal one', () => {
    const tracks: TrackInput[] = [
      ...Array.from({ length: 6 }, (_, i) => ({
        at: at(5, 6 + i),
        piece: 'straight',
        rotation: 0,
      })),
      { at: at(5, 5), piece: 'curve45', rotation: 0 }, // S → NE
      ...Array.from({ length: 6 }, (_, i) => ({
        at: at(6 + i, 4 - i),
        piece: 'straight',
        rotation: 45,
      })),
    ];
    const { state, ctx } = game(tracks.filter((t) => t.at.y >= 0));
    const placed = applyAction(state, ctx, {
      type: 'placeTrain',
      cell: at(5, 9),
      locomotive: 'loco_diesel',
      wagons: ['wagon_box'],
      facing: 'N',
    });
    if (!placed.ok) throw new Error(placed.reason);
    const started = setTrainRunning(enterRunMode(placed.state), 't1', true);
    if (!started.ok) throw new Error(started.reason);

    let current = started.state;
    const visited: string[] = [];
    for (let i = 0; i < 60; i++) {
      current = advance(current, ctx, 1).state;
      const head = current.trains[0]?.head;
      if (head) visited.push(`${head.cell.x},${head.cell.y}:${head.entry}>${head.exit ?? '.'}`);
    }
    expect(visited).toContain('5,5:S>NE');
    expect(visited).toContain('6,4:SW>NE');
    const train = current.trains[0];
    if (!train) throw new Error('no train');
    expect(train.status).toBe('running');
    expect(trainPoses(train)[0]?.facing).toBe('NE');
  });

  it('Scenario: Diagonal switch', () => {
    const sw = pieceOf('switch45');
    expect(exitFor(sw, 0, 0, 'S')).toBe('N');
    expect(exitFor(sw, 0, 1, 'S')).toBe('NE');
    // Trailing moves lead back to the trunk whatever the state.
    expect(exitFor(sw, 0, 0, 'NE')).toBe('S');
    // At 45° the diagonal switch's trunk is SW, its branches NE and E.
    expect(exitFor(sw, 45, 1, 'SW')).toBe('E');
  });

  it('Scenario: Pieces only take the rotations they can draw', () => {
    const { state, ctx } = game([]);
    const place = (piece: string, rotation: number) =>
      applyAction(state, ctx, { type: 'placeTrack', cell: at(3, 3), piece, rotation });
    expect(place('straight', 45).ok).toBe(true);
    expect(place('curve', 45)).toMatchObject({ ok: false, reason: REASONS.invalidRotation });
    expect(place('curve45', 135).ok).toBe(true);

    expect(rotationStep(pieceOf('straight'))).toBe(45);
    expect(rotationStep(pieceOf('cross'))).toBe(45);
    expect(rotationStep(pieceOf('buffer'))).toBe(45);
    expect(rotationStep(pieceOf('curve45'))).toBe(45);
    expect(rotationStep(pieceOf('switch45'))).toBe(45);
    expect(rotationStep(pieceOf('curve'))).toBe(90);
    expect(rotationStep(pieceOf('switch'))).toBe(90);
    expect(rotationStep(pieceOf('wye'))).toBe(90);
    expect(rotationStep(pieceOf('station_track'))).toBe(90);
    expect(rotationStep(pieceOf('straight'), false)).toBe(90);

    expect(snapRotation(pieceOf('curve'), 135)).toBe(90);
    expect(snapRotation(pieceOf('straight'), 135)).toBe(135);
    expect(canPlaceAt(pieceOf('straight'), 45, false)).toBe(false);
  });

  it('rotating a placed diagonal-capable piece turns it 45°', () => {
    const { state, ctx } = game([{ at: at(3, 3), piece: 'straight', rotation: 0 }]);
    const turned = applyAction(state, ctx, { type: 'rotateTrack', cell: at(3, 3) });
    expect(turned.ok && turned.state.world.tracks[0]?.rotation).toBe(45);
  });
});

describe('diagonal geometry', () => {
  it('knows which routes can be drawn', () => {
    expect(isDrawableRoute('S', 'N')).toBe(true);
    expect(isDrawableRoute('NE', 'SW')).toBe(true);
    expect(isDrawableRoute('S', 'E')).toBe(true);
    expect(isDrawableRoute('S', 'NE')).toBe(true);
    expect(isDrawableRoute('SW', 'E')).toBe(true);
    expect(isDrawableRoute('SW', null)).toBe(true);
    expect(isDrawableRoute('SW', 'SE')).toBe(false); // sharp corner-to-corner curve
    expect(isDrawableRoute('S', 'SE')).toBe(false);
  });

  it('a 45° turn is a smooth curve from edge to corner', () => {
    const shape = routeShape('S', 'NE');
    expect(shape.kind).toBe('cubic');
    expect(routeLength('S', 'NE')).toBeGreaterThan(1.1);
    expect(routeLength('S', 'NE')).toBeLessThan(1.25);
    expect(routePoint(shape, 0)).toEqual({ x: 0.5, y: 1 });
    const end = routePoint(shape, 1);
    expect(end.x).toBeCloseTo(1, 9);
    expect(end.y).toBeCloseTo(0, 9);
    // Walked by arc length: equal steps in t are (nearly) equal distances.
    const d = (t1: number, t2: number) => {
      const a = routePoint(shape, t1);
      const b = routePoint(shape, t2);
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(d(0, 0.1)).toBeCloseTo(d(0.5, 0.6), 2);
    expect(routeShape('S', 'NE')).toBe(shape); // memoized
  });

  it('diagonal straights are √2 long', () => {
    expect(routeLength('NE', 'SW')).toBeCloseTo(Math.SQRT2, 9);
    expect(routeLength('NE', null)).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('vehicles snap to 8 facings with diagonals, 4 without', () => {
    expect(facingOf(1, -1)).toBe('NE');
    expect(facingOf(-1, 1)).toBe('SW');
    expect(facingOf(1, 0.3)).toBe('E');
    expect(facingOf(1, -1, false)).toBe('N');
    expect(PORTS.filter(isDiagonal)).toHaveLength(4);
  });
});
