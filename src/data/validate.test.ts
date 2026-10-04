import { describe, expect, it } from 'vitest';
import { buildWorld, terrainAt } from '../core/world/world';
import { RAW_CATALOGS } from './loader';
import type { Catalogs } from './schemas/catalogs';
import type { LevelInput } from './schemas/level';
import {
  formatPath,
  validateCatalogs,
  validateLevel,
  validateLevelIndex,
  type Result,
} from './validate';

/** Pieces in the bundled catalog: test pieces appended to it start at this index. */
const PIECES = RAW_CATALOGS.trackPieces.pieces.length;

const catalogs = (() => {
  const result = validateCatalogs(RAW_CATALOGS);
  if (!result.ok) throw new Error('bundled catalogs are invalid');
  return result.value;
})();

const clone = <T>(value: T): T => structuredClone(value);

function first<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected a non-empty list');
  return item;
}

function baseLevel(): LevelInput {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test',
    map: { widthPx: 1000, heightPx: 1000, defaultTerrain: 'grass' },
    editorRules: { allowTerrainEdit: true, allowObjectEdit: true, maxTrains: null },
    economy: { initialMoney: 1000, fuelPrice: 0.5 },
    seed: 1,
  };
}

function withMap(map: Partial<LevelInput['map']>, extra: Partial<LevelInput> = {}): LevelInput {
  const level = baseLevel();
  return { ...level, ...extra, map: { ...level.map, ...map } };
}

function issuesOf<T>(result: Result<T>): string[] {
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
}

function valid(level: LevelInput) {
  const result = validateLevel(level, catalogs);
  if (!result.ok) throw new Error(issuesOf(result).join('\n'));
  return result.value;
}

describe('Feature: Build the map from the level configuration', () => {
  it('Scenario: Default 1000x1000 map', () => {
    const world = buildWorld(valid(baseLevel()), catalogs);
    expect(world.cols).toBe(50);
    expect(world.rows).toBe(50);
    expect(new Set(world.terrain)).toEqual(new Set(['grass']));
  });

  it('Scenario: Dimensions not multiple of 20', () => {
    const result = validateLevel(withMap({ widthPx: 1010 }), catalogs);
    expect(issuesOf(result)).toContain('level: map.widthPx: widthPx must be a multiple of 20');
  });

  it('rejects maps outside the size limits', () => {
    expect(issuesOf(validateLevel(withMap({ heightPx: 4020 }), catalogs))).toContain(
      'level: map.heightPx: heightPx must be between 200 and 4000',
    );
  });

  it('Scenario: Terrain patch', () => {
    const level = valid(
      withMap({ terrainPatches: [{ terrain: 'desert', rect: { x: 30, y: 0, w: 20, h: 50 } }] }),
    );
    const world = buildWorld(level, catalogs);
    expect(terrainAt(world, { x: 30, y: 0 })).toBe('desert');
    expect(terrainAt(world, { x: 29, y: 0 })).toBe('grass');
  });

  it('Scenario: Unknown terrain', () => {
    const result = validateLevel(
      withMap({ terrainPatches: [{ terrain: 'lava', rect: { x: 0, y: 0, w: 1, h: 1 } }] }),
      catalogs,
    );
    expect(issuesOf(result)).toContain(
      'level: map.terrainPatches[0].terrain: unknown terrain "lava"',
    );
  });

  it('rejects patches outside the map', () => {
    const result = validateLevel(
      withMap({ terrainPatches: [{ terrain: 'snow', rect: { x: 45, y: 0, w: 10, h: 1 } }] }),
      catalogs,
    );
    expect(issuesOf(result)).toContain(
      'level: map.terrainPatches[0].rect: patch is outside the map',
    );
  });

  it('reports schema errors with their JSON path', () => {
    const level = baseLevel() as unknown as Record<string, unknown>;
    level['seed'] = 'abc';
    expect(issuesOf(validateLevel(level, catalogs))[0]).toMatch(/^level: seed: /);
  });
});

describe('level objects', () => {
  it('rejects unknown objects, objects that do not fit and disallowed terrain', () => {
    const result = validateLevel(
      withMap({
        terrainPatches: [{ terrain: 'desert', rect: { x: 0, y: 0, w: 5, h: 5 } }],
        objects: [
          { type: 'ufo', at: { x: 1, y: 1 } },
          { type: 'house_s', at: { x: 49, y: 49 } },
          { type: 'tree_pine', at: { x: 2, y: 2 } },
          { type: 'rock', at: { x: 10, y: 10 } },
          { type: 'rock', at: { x: 10, y: 10 } },
        ],
      }),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: map.objects[0].type: unknown object "ufo"',
      'level: map.objects[1].at: object "house_s" does not fit inside the map',
      'level: map.objects[2].at: object "tree_pine" is not allowed on terrain "desert"',
      'level: map.objects[4].at: objects overlap at (10,10)',
    ]);
  });

  it('objects without allowedTerrains need buildable terrain', () => {
    const result = validateLevel(
      withMap({
        terrainPatches: [{ terrain: 'water', rect: { x: 0, y: 0, w: 2, h: 2 } }],
        objects: [{ type: 'rock', at: { x: 0, y: 0 } }],
      }),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: map.objects[0].at: object "rock" is not allowed on terrain "water"',
    ]);
  });

  it('gives objects stable ids', () => {
    const world = buildWorld(
      valid(
        withMap({
          objects: [
            { type: 'rock', at: { x: 1, y: 1 } },
            { type: 'rock', at: { x: 2, y: 1 } },
          ],
        }),
      ),
      catalogs,
    );
    expect(world.objects.map((o) => o.id)).toEqual(['obj-1', 'obj-2']);
  });
});

describe('level tracks', () => {
  it('rejects invalid tracks', () => {
    const result = validateLevel(
      withMap({
        terrainPatches: [{ terrain: 'water', rect: { x: 0, y: 0, w: 1, h: 1 } }],
        objects: [{ type: 'rock', at: { x: 5, y: 5 } }],
        tracks: [
          { at: { x: 0, y: 0 }, piece: 'straight', rotation: 0 },
          { at: { x: 5, y: 5 }, piece: 'straight', rotation: 0 },
          { at: { x: 6, y: 6 }, piece: 'curve', rotation: 45 },
          { at: { x: 7, y: 7 }, piece: 'monorail', rotation: 0 },
          { at: { x: 60, y: 7 }, piece: 'straight', rotation: 0 },
          { at: { x: 8, y: 8 }, piece: 'switch', rotation: 0, state: 2 },
          { at: { x: 8, y: 8 }, piece: 'straight', rotation: 0 },
        ],
      }),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: map.tracks[0].at: Terrain not buildable',
      'level: map.tracks[1].at: Cell occupied',
      'level: map.tracks[2].rotation: invalid rotation 45',
      'level: map.tracks[3].piece: unknown piece "monorail"',
      'level: map.tracks[4].at: track is outside the map',
      'level: map.tracks[5].state: state is out of range',
      'level: map.tracks[6].at: two tracks at (8,8)',
    ]);
  });

  it('stateful tracks start in their default state', () => {
    const world = buildWorld(
      valid(withMap({ tracks: [{ at: { x: 1, y: 1 }, piece: 'switch', rotation: 90 }] })),
      catalogs,
    );
    expect(world.tracks[0]).toMatchObject({ state: 0, locked: false });
  });
});

describe('level stations', () => {
  const platform = (x: number, y: number, rotation = 0) => ({
    at: { x, y },
    piece: 'station_track',
    rotation,
  });
  const station = (cells: { x: number; y: number }[]) => ({
    id: 'st_A',
    name: 'A',
    cells,
    dwellSeconds: 3,
    supplies: [{ cargo: 'coal', ratePerMinute: 1, capacity: 10, initial: 0 }],
  });

  it('accepts a vertical station on platform tracks', () => {
    valid(
      withMap({
        tracks: [platform(3, 3), platform(3, 4)],
        stations: [
          station([
            { x: 3, y: 3 },
            { x: 3, y: 4 },
          ]),
        ],
      }),
    );
  });

  it('rejects stations that are not straight lines, lack platforms or run across them', () => {
    const result = validateLevel(
      withMap({
        tracks: [platform(3, 3), platform(4, 4), platform(10, 10), platform(11, 10)],
        stations: [
          station([
            { x: 3, y: 3 },
            { x: 4, y: 4 },
          ]),
          {
            ...station([
              { x: 10, y: 10 },
              { x: 11, y: 10 },
              { x: 12, y: 10 },
            ]),
            id: 'st_B',
          },
        ],
      }),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: map.stations[0].cells: station cells must form a contiguous straight line',
      'level: map.stations[1].cells[0]: platform track must run along the station',
      'level: map.stations[1].cells[1]: platform track must run along the station',
      'level: map.stations[1].cells[2]: station cells need a platform track (isStation piece)',
    ]);
  });

  it('rejects duplicate stations, shared cells and unknown cargo', () => {
    const st = station([{ x: 3, y: 3 }]);
    const result = validateLevel(
      withMap({
        tracks: [platform(3, 3)],
        stations: [st, { ...st, demands: [{ cargo: 'unobtainium' }] }],
      }),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: map.stations[1].id: duplicate id: st_A',
      'level: map.stations[1].cells[0]: cell already belongs to a station',
      'level: map.stations[1].demands[0].cargo: unknown cargo "unobtainium"',
    ]);
  });
});

describe('level rules, economy, objectives and scoring', () => {
  it('rejects unknown references', () => {
    const result = validateLevel(
      withMap(
        {},
        {
          editorRules: {
            allowTerrainEdit: false,
            allowObjectEdit: false,
            maxTrains: 1,
            allowedPieces: ['teleporter'],
            allowedLocomotives: ['loco_maglev'],
            allowedWagons: ['wagon_ufo'],
          },
          economy: { initialMoney: 10, fuelPrice: 1, payOverrides: { gold: 9 } },
          objectives: [
            { id: 'o1', type: 'deliver', cargo: 'coal', amount: 5, to: 'st_X', from: 'st_Y' },
          ],
          scoring: { stars: [{ stars: 1 }, { stars: 2 }] },
        },
      ),
      catalogs,
    );
    expect(issuesOf(result)).toEqual([
      'level: editorRules.allowedPieces[0]: unknown piece "teleporter"',
      'level: editorRules.allowedLocomotives[0]: unknown locomotive "loco_maglev"',
      'level: editorRules.allowedWagons[0]: unknown wagon "wagon_ufo"',
      'level: economy.payOverrides.gold: unknown cargo "gold"',
      'level: objectives[0].to: unknown station "st_X"',
      'level: objectives[0].from: unknown station "st_Y"',
      'level: scoring.stars[1].stars: star tiers must be listed from best to worst',
    ]);
  });
});

describe('Feature: Content extensible through JSON', () => {
  const rawWith = (mutate: (raw: typeof RAW_CATALOGS) => void) => {
    const raw = clone(RAW_CATALOGS);
    mutate(raw);
    return validateCatalogs(raw);
  };

  it('Scenario: Add a new terrain without code', () => {
    const result = rawWith((raw) => {
      // A modder's terrain: no sprite and an off-palette color are both allowed.
      const terrains: unknown[] = raw.terrains.terrains;
      terrains.push({
        id: 'mud',
        name: 'Mud',
        color: '#5B4A3A',
        buildable: true,
        trackCostMultiplier: 1.3,
        fuelMultiplier: 1.4,
        speedMultiplier: 0.8,
      });
    });
    expect(result.ok && result.value.terrains['mud']?.name).toBe('Mud');
    const mudCatalogs = (result as { value: Catalogs }).value;
    const level = validateLevel(withMap({ defaultTerrain: 'mud' }), mudCatalogs);
    expect(level.ok).toBe(true);
  });

  it('Scenario: Duplicate IDs', () => {
    const result = rawWith((raw) => {
      raw.terrains.terrains.push({ ...first(raw.terrains.terrains) });
    });
    expect(issuesOf(result)).toContain('terrains.json: terrains[5].id: duplicate id: grass');
  });

  it('Scenario: Diagonal pieces are data, but every route must be drawable (Stage 8)', () => {
    const result = rawWith((raw) => {
      (raw.trackPieces.pieces as unknown[]).push(
        { id: 'diag', name: 'Diagonal', cost: 1, routes: [['NE', 'SW']] },
        { id: 'hairpin', name: 'Hairpin', cost: 1, routes: [['SW', 'SE']] },
      );
    });
    const issues = issuesOf(result);
    expect(issues.some((i) => i.includes(`pieces[${PIECES}]`))).toBe(false);
    expect(issues).toContain(
      `track-pieces.json: pieces[${PIECES + 1}].routes[0]: this route cannot be drawn (see spec §4.4)`,
    );
  });

  it('reports schema errors per file', () => {
    const result = rawWith((raw) => {
      (raw.terrains.terrains[0] as { color: string }).color = 'green';
    });
    expect(issuesOf(result)).toEqual([
      'terrains.json: terrains[0].color: colors use the #RRGGBB format',
    ]);
  });

  it('checks cross references and piece rules', () => {
    const result = rawWith((raw) => {
      first(raw.objects.objects).allowedTerrains = ['lava'];
      first(raw.trainModels.wagons).accepts = ['unobtainium'];
      (raw.trackPieces.pieces as unknown[]).push(
        { id: 'loop', name: 'Loop', cost: 1, routes: [['N', 'N']] },
        {
          id: 'sw1',
          name: 'No trunk',
          cost: 1,
          stateful: true,
          routes: [
            ['S', 'N'],
            ['S', 'E'],
          ],
        },
        {
          id: 'sw2',
          name: 'Bad trunk',
          cost: 1,
          stateful: true,
          trunk: 'W',
          defaultState: 5,
          routes: [['S', 'N']],
        },
      );
    });
    expect(issuesOf(result)).toEqual([
      'objects.json: objects[0].allowedTerrains[0]: unknown terrain "lava"',
      `track-pieces.json: pieces[${PIECES}].routes[0]: a route needs two different ports`,
      `track-pieces.json: pieces[${PIECES + 1}].trunk: stateful pieces need a trunk port`,
      `track-pieces.json: pieces[${PIECES + 2}].routes: every route must include the trunk "W"`,
      `track-pieces.json: pieces[${PIECES + 2}].routes: stateful pieces need at least two routes`,
      `track-pieces.json: pieces[${PIECES + 2}].defaultState: defaultState is out of range`,
      'train-models.json: wagons[0].accepts[0]: unknown cargo "unobtainium"',
    ]);
  });
});

describe('level index', () => {
  it('rejects duplicate ids', () => {
    const result = validateLevelIndex({
      schemaVersion: 1,
      levels: [
        { id: 'a', name: 'A', unlocked: true },
        { id: 'a', name: 'A2', unlocked: false },
      ],
    });
    expect(issuesOf(result)).toEqual(['levels/index.json: levels[1].id: duplicate id: a']);
  });

  it('reports schema errors', () => {
    expect(validateLevelIndex({ schemaVersion: 2 }).ok).toBe(false);
  });
});

describe('formatPath', () => {
  it('formats nested paths', () => {
    expect(formatPath(['map', 'terrainPatches', 0, 'terrain'])).toBe(
      'map.terrainPatches[0].terrain',
    );
    expect(formatPath([])).toBe('');
  });
});
