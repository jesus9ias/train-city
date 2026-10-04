import { describe, expect, it } from 'vitest';
import { makeGame, makeLevel } from '../../test/fixtures';
import { moneyOf, type GameState, type RulesContext } from '../game/state';
import { piecePorts } from '../track/routes';
import { objectAt, terrainAt, trackAt } from '../world/world';
import { applyAction, REASONS, type EditorAction } from './actions';

function run(state: GameState, ctx: RulesContext, action: EditorAction): GameState {
  const outcome = applyAction(state, ctx, action);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.state;
}

function reasonOf(state: GameState, ctx: RulesContext, action: EditorAction): string | null {
  const outcome = applyAction(state, ctx, action);
  return outcome.ok ? null : outcome.reason;
}

const at = (x: number, y: number) => ({ x, y });

describe('Feature: Paint terrain in the editor', () => {
  it('Scenario: Paint with the brush', () => {
    const { state, ctx } = makeGame(makeLevel());
    const next = run(state, ctx, {
      type: 'paintTerrain',
      cells: [at(1, 1), at(2, 1), at(3, 1)],
      terrain: 'snow',
    });
    expect([at(1, 1), at(2, 1), at(3, 1)].map((c) => terrainAt(next.world, c))).toEqual([
      'snow',
      'snow',
      'snow',
    ]);
    expect(terrainAt(next.world, at(4, 1))).toBe('grass');
  });

  it('Scenario: Terrain locked by the level', () => {
    const { state, ctx } = makeGame(
      makeLevel(
        {},
        { editorRules: { allowTerrainEdit: false, allowObjectEdit: true, maxTrains: 1 } },
      ),
    );
    expect(reasonOf(state, ctx, { type: 'paintTerrain', cells: [at(1, 1)], terrain: 'snow' })).toBe(
      REASONS.noTerrainEdit,
    );
  });

  it('skips cells where the new terrain would break a track or an object', () => {
    const { state, ctx } = makeGame(
      makeLevel({
        tracks: [{ at: at(1, 1), piece: 'straight', rotation: 0 }],
        objects: [{ type: 'tree_pine', at: at(2, 1) }],
      }),
    );
    const action = {
      type: 'paintTerrain',
      cells: [at(1, 1), at(2, 1), at(3, 1), at(99, 99)],
      terrain: 'water',
    } as const;
    const next = run(state, ctx, action);
    expect(terrainAt(next.world, at(1, 1))).toBe('grass');
    expect(terrainAt(next.world, at(2, 1))).toBe('grass');
    expect(terrainAt(next.world, at(3, 1))).toBe('water');

    expect(reasonOf(state, ctx, { ...action, cells: [at(1, 1)] })).toBe(REASONS.notBuildable);
    expect(reasonOf(state, ctx, { ...action, cells: [at(2, 1)] })).toBe(REASONS.terrainNotAllowed);
    expect(reasonOf(state, ctx, { ...action, cells: [at(99, 99)] })).toBe(REASONS.outside);
    expect(reasonOf(next, ctx, { ...action, cells: [at(3, 1)] })).toBe(REASONS.noChange);
    expect(reasonOf(state, ctx, { ...action, terrain: 'lava' })).toBe(REASONS.notAllowed);
  });
});

describe('Feature: Place and remove objects', () => {
  it('Scenario: Place a tree', () => {
    const { state, ctx } = makeGame(makeLevel());
    const next = run(state, ctx, { type: 'placeObject', cell: at(4, 4), object: 'tree_pine' });
    expect(objectAt(next.world, ctx.catalogs, at(4, 4))?.type).toBe('tree_pine');
  });

  it('Scenario: Multi-cell object that does not fit', () => {
    const { state, ctx } = makeGame(makeLevel());
    expect(reasonOf(state, ctx, { type: 'placeObject', cell: at(49, 49), object: 'house_s' })).toBe(
      REASONS.doesNotFit,
    );
  });

  it('Scenario: Object on a disallowed terrain', () => {
    const { state, ctx } = makeGame(makeLevel({ defaultTerrain: 'desert' }));
    expect(reasonOf(state, ctx, { type: 'placeObject', cell: at(4, 4), object: 'tree_pine' })).toBe(
      REASONS.terrainNotAllowed,
    );
  });

  it('Scenario: Removing an object costs money', () => {
    const level = makeLevel(
      { objects: [{ type: 'rock', at: at(4, 4) }] },
      { economy: { initialMoney: 100, fuelPrice: 1 } },
    );
    const { state, ctx } = makeGame(level);
    const next = run(state, ctx, { type: 'erase', cell: at(4, 4) });
    expect(objectAt(next.world, ctx.catalogs, at(4, 4))).toBeUndefined();
    expect(moneyOf(next)).toBe(90);
  });

  it('Scenario: Remove an object locked by the level', () => {
    const { state, ctx } = makeGame(
      makeLevel({ objects: [{ type: 'house_s', at: at(20, 20), locked: true }] }),
    );
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(21, 21) })).toBe(REASONS.locked);
  });

  it('objects placed in this session are removed for free', () => {
    const { state, ctx } = makeGame(makeLevel());
    const placed = run(state, ctx, { type: 'placeObject', cell: at(4, 4), object: 'rock' });
    const removed = run(placed, ctx, { type: 'erase', cell: at(4, 4) });
    expect(moneyOf(removed)).toBe(1000);
  });

  it('rejects overlaps, non-removable objects, missing money and disabled object editing', () => {
    const level = makeLevel(
      {
        objects: [
          { type: 'house_s', at: at(10, 10) },
          { type: 'rock', at: at(2, 2) },
        ],
        tracks: [{ at: at(6, 6), piece: 'straight', rotation: 0 }],
      },
      { economy: { initialMoney: 5, fuelPrice: 1 } },
    );
    const { state, ctx } = makeGame(level);
    expect(reasonOf(state, ctx, { type: 'placeObject', cell: at(11, 11), object: 'rock' })).toBe(
      REASONS.occupied,
    );
    expect(reasonOf(state, ctx, { type: 'placeObject', cell: at(6, 6), object: 'rock' })).toBe(
      REASONS.occupied,
    );
    expect(reasonOf(state, ctx, { type: 'placeObject', cell: at(1, 1), object: 'ufo' })).toBe(
      REASONS.notAllowed,
    );
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(10, 10) })).toBe(REASONS.notRemovable);
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(2, 2) })).toBe(REASONS.noMoney);
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(30, 30) })).toBe(REASONS.nothingToErase);

    const noObjects = { ...ctx, rules: { ...ctx.rules, allowObjectEdit: false } };
    expect(reasonOf(state, noObjects, { type: 'erase', cell: at(2, 2) })).toBe(
      REASONS.noObjectEdit,
    );
    expect(
      reasonOf(state, noObjects, { type: 'placeObject', cell: at(1, 1), object: 'rock' }),
    ).toBe(REASONS.noObjectEdit);
  });

  it('gives new objects stable, increasing ids', () => {
    const { state, ctx } = makeGame(makeLevel({ objects: [{ type: 'rock', at: at(1, 1) }] }));
    const a = run(state, ctx, { type: 'placeObject', cell: at(4, 4), object: 'rock' });
    const b = run(a, ctx, { type: 'placeObject', cell: at(5, 4), object: 'rock' });
    expect(b.world.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2', 'obj-3']);
  });
});

describe('Feature: Build tracks', () => {
  it('Scenario: Place a straight and rotate it', () => {
    const { state, ctx } = makeGame(makeLevel());
    const next = run(state, ctx, {
      type: 'placeTrack',
      cell: at(10, 10),
      piece: 'straight',
      rotation: 90,
    });
    const track = trackAt(next.world, at(10, 10));
    expect(track?.rotation).toBe(90);
    const piece = ctx.catalogs.pieces['straight'];
    expect(piece && piecePorts(piece, 90).sort()).toEqual(['E', 'W']);
  });

  it('Scenario: Cannot build on a blocking object', () => {
    const { state, ctx } = makeGame(makeLevel({ objects: [{ type: 'rock', at: at(4, 4) }] }));
    expect(
      reasonOf(state, ctx, { type: 'placeTrack', cell: at(4, 4), piece: 'straight', rotation: 0 }),
    ).toBe(REASONS.occupied);
  });

  it('Scenario: Cannot build on water', () => {
    const { state, ctx } = makeGame(
      makeLevel({ terrainPatches: [{ terrain: 'water', rect: { x: 8, y: 8, w: 1, h: 1 } }] }),
    );
    expect(
      reasonOf(state, ctx, { type: 'placeTrack', cell: at(8, 8), piece: 'curve', rotation: 0 }),
    ).toBe(REASONS.notBuildable);
  });

  it('Scenario: Not enough money', () => {
    const { state, ctx } = makeGame(makeLevel({}, { economy: { initialMoney: 5, fuelPrice: 1 } }));
    expect(
      reasonOf(state, ctx, { type: 'placeTrack', cell: at(1, 1), piece: 'straight', rotation: 0 }),
    ).toBe(REASONS.noMoney);
  });

  it('Scenario: Cost depends on terrain', () => {
    const { state, ctx } = makeGame(
      makeLevel({ defaultTerrain: 'snow' }, { economy: { initialMoney: 100, fuelPrice: 1 } }),
    );
    const next = run(state, ctx, {
      type: 'placeTrack',
      cell: at(1, 1),
      piece: 'straight',
      rotation: 0,
    });
    expect(moneyOf(next)).toBe(85);
  });

  it('Scenario: Erasing refunds part of the cost', () => {
    const { state, ctx } = makeGame(
      makeLevel({}, { economy: { initialMoney: 100, fuelPrice: 1 } }),
    );
    const placed = run(state, ctx, {
      type: 'placeTrack',
      cell: at(1, 1),
      piece: 'straight',
      rotation: 0,
    });
    const nextSession = { ...placed, editorSession: placed.editorSession + 1 };
    const erased = run(nextSession, ctx, { type: 'erase', cell: at(1, 1) });
    expect(moneyOf(placed)).toBe(90);
    expect(moneyOf(erased)).toBe(95);
  });

  it('erasing a piece placed in the current session refunds it fully', () => {
    const { state, ctx } = makeGame(makeLevel());
    const placed = run(state, ctx, {
      type: 'placeTrack',
      cell: at(1, 1),
      piece: 'straight',
      rotation: 0,
    });
    expect(moneyOf(run(placed, ctx, { type: 'erase', cell: at(1, 1) }))).toBe(1000);
  });

  it('rejects disallowed pieces, bad rotations, occupied cells and positions outside the map', () => {
    const level = makeLevel(
      { tracks: [{ at: at(3, 3), piece: 'straight', rotation: 0 }] },
      {
        editorRules: {
          allowTerrainEdit: true,
          allowObjectEdit: true,
          maxTrains: 1,
          allowedPieces: ['straight'],
        },
      },
    );
    const { state, ctx } = makeGame(level);
    const place = (cell: { x: number; y: number }, piece = 'straight', rotation = 0) =>
      reasonOf(state, ctx, { type: 'placeTrack', cell, piece, rotation });
    expect(place(at(1, 1), 'curve')).toBe(REASONS.notAllowed);
    expect(place(at(1, 1), 'monorail')).toBe(REASONS.notAllowed);
    expect(place(at(1, 1), 'straight', 30)).toBe(REASONS.invalidRotation);
    expect(place(at(-1, 1))).toBe(REASONS.outside);
    expect(place(at(3, 3))).toBe(REASONS.occupied);
  });

  it('stateful pieces start in their default state', () => {
    const { state, ctx } = makeGame(makeLevel());
    const next = run(state, ctx, {
      type: 'placeTrack',
      cell: at(1, 1),
      piece: 'switch',
      rotation: 0,
    });
    expect(trackAt(next.world, at(1, 1))?.state).toBe(0);
  });
});

describe('rotating and protecting placed tracks', () => {
  const stationLevel = () =>
    makeLevel({
      tracks: [
        { at: at(3, 3), piece: 'station_track', rotation: 0 },
        { at: at(5, 5), piece: 'curve', rotation: 0, locked: true },
        { at: at(7, 7), piece: 'curve', rotation: 270 },
      ],
      stations: [{ id: 'st_A', name: 'A', cells: [at(3, 3)], dwellSeconds: 1 }],
    });

  it('rotates a track clockwise by 90°', () => {
    const { state, ctx } = makeGame(stationLevel());
    const next = run(state, ctx, { type: 'rotateTrack', cell: at(7, 7) });
    expect(trackAt(next.world, at(7, 7))?.rotation).toBe(0);
  });

  it('does not rotate or erase locked or station tracks', () => {
    const { state, ctx } = makeGame(stationLevel());
    expect(reasonOf(state, ctx, { type: 'rotateTrack', cell: at(5, 5) })).toBe(REASONS.locked);
    expect(reasonOf(state, ctx, { type: 'rotateTrack', cell: at(3, 3) })).toBe(
      REASONS.partOfStation,
    );
    expect(reasonOf(state, ctx, { type: 'rotateTrack', cell: at(9, 9) })).toBe(
      REASONS.nothingToRotate,
    );
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(5, 5) })).toBe(REASONS.locked);
    expect(reasonOf(state, ctx, { type: 'erase', cell: at(3, 3) })).toBe(REASONS.partOfStation);
  });

  it('level tracks were free, so erasing them refunds nothing', () => {
    const { state, ctx } = makeGame(stationLevel());
    const outcome = applyAction(state, ctx, { type: 'erase', cell: at(7, 7) });
    expect(outcome.ok && outcome.delta).toBe(0);
  });
});

describe('unlimited money', () => {
  it('never runs out', () => {
    const { state, ctx } = makeGame(
      makeLevel({}, { economy: { initialMoney: null, fuelPrice: 1 } }),
    );
    const next = run(state, ctx, {
      type: 'placeTrack',
      cell: at(1, 1),
      piece: 'cross',
      rotation: 0,
    });
    expect(moneyOf(next)).toBeNull();
    expect(next.ledger.build).toBe(30);
  });
});
