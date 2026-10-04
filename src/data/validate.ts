import type { z } from 'zod';
import { CELL_SIZE, FEATURES, MAP_MAX_PX, MAP_MIN_PX } from '../core/constants';
import type { Cell } from '../core/grid/coords';
import { isDiagonal, isValidRotation, oppositePort, type Port } from '../core/grid/ports';
import { piecePorts } from '../core/track/routes';
import {
  cellIndex,
  cellKey,
  footprintCells,
  gridDims,
  inBounds,
  paintTerrain,
} from '../core/world/world';
import {
  cargoTypesFileSchema,
  objectsFileSchema,
  terrainsFileSchema,
  trackPiecesFileSchema,
  trainModelsFileSchema,
  type Catalogs,
} from './schemas/catalogs';
import { levelIndexSchema, levelSchema, type Level, type LevelIndex } from './schemas/level';

export type Issue = { readonly path: string; readonly message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export class DataError extends Error {
  constructor(
    readonly source: string,
    readonly issues: readonly Issue[],
  ) {
    super(`${source}: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    this.name = 'DataError';
  }
}

/** `['map', 'terrainPatches', 0, 'terrain']` → `map.terrainPatches[0].terrain`. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, part) => {
    if (typeof part === 'number') return `${acc}[${part}]`;
    const name = String(part);
    return acc ? `${acc}.${name}` : name;
  }, '');
}

function parse<S extends z.ZodType>(schema: S, raw: unknown, prefix: string): Result<z.output<S>> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: [prefix, formatPath(issue.path)].filter(Boolean).join(': '),
      message: issue.message,
    })),
  };
}

/** Collects issues with a fixed path prefix. */
class Issues {
  readonly list: Issue[] = [];
  constructor(private readonly prefix = '') {}
  add(path: readonly PropertyKey[], message: string): void {
    this.list.push({ path: [this.prefix, formatPath(path)].filter(Boolean).join(': '), message });
  }
}

function indexById<T extends { id: string }>(
  items: readonly T[],
  path: readonly PropertyKey[],
  issues: Issues,
): Record<string, T> {
  const index: Record<string, T> = {};
  items.forEach((item, i) => {
    if (item.id in index) issues.add([...path, i, 'id'], `duplicate id: ${item.id}`);
    else index[item.id] = item;
  });
  return index;
}

// ---------------------------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------------------------

export type RawCatalogs = {
  terrains: unknown;
  objects: unknown;
  trackPieces: unknown;
  trainModels: unknown;
  cargoTypes: unknown;
};

export function validateCatalogs(raw: RawCatalogs): Result<Catalogs> {
  const files = {
    terrains: parse(terrainsFileSchema, raw.terrains, 'terrains.json'),
    objects: parse(objectsFileSchema, raw.objects, 'objects.json'),
    pieces: parse(trackPiecesFileSchema, raw.trackPieces, 'track-pieces.json'),
    trains: parse(trainModelsFileSchema, raw.trainModels, 'train-models.json'),
    cargo: parse(cargoTypesFileSchema, raw.cargoTypes, 'cargo-types.json'),
  };
  const { terrains, objects, pieces, trains, cargo } = files;
  if (!terrains.ok || !objects.ok || !pieces.ok || !trains.ok || !cargo.ok) {
    return {
      ok: false,
      issues: Object.values(files).flatMap((file) => (file.ok ? [] : file.issues)),
    };
  }

  const terrainIssues = new Issues('terrains.json');
  const objectIssues = new Issues('objects.json');
  const pieceIssues = new Issues('track-pieces.json');
  const trainIssues = new Issues('train-models.json');
  const cargoIssues = new Issues('cargo-types.json');

  const catalogs: Catalogs = {
    terrains: indexById(terrains.value.terrains, ['terrains'], terrainIssues),
    objects: indexById(objects.value.objects, ['objects'], objectIssues),
    pieces: indexById(pieces.value.pieces, ['pieces'], pieceIssues),
    locomotives: indexById(trains.value.locomotives, ['locomotives'], trainIssues),
    wagons: indexById(trains.value.wagons, ['wagons'], trainIssues),
    cargoTypes: indexById(cargo.value.cargoTypes, ['cargoTypes'], cargoIssues),
  };

  objects.value.objects.forEach((object, i) => {
    object.allowedTerrains?.forEach((id, j) => {
      if (!catalogs.terrains[id]) {
        objectIssues.add(['objects', i, 'allowedTerrains', j], `unknown terrain "${id}"`);
      }
    });
  });

  pieces.value.pieces.forEach((piece, i) => {
    piece.routes.forEach(([from, to], j) => {
      const ports = to === null ? [from] : [from, to];
      if (!FEATURES.diagonals && ports.some(isDiagonal)) {
        pieceIssues.add(['pieces', i, 'routes', j], 'Diagonal ports are not enabled');
      }
      if (from === to)
        pieceIssues.add(['pieces', i, 'routes', j], 'a route needs two different ports');
    });
    if (piece.stateful) {
      if (piece.trunk === undefined) {
        pieceIssues.add(['pieces', i, 'trunk'], 'stateful pieces need a trunk port');
      } else if (!piece.routes.every((route) => route.includes(piece.trunk ?? null))) {
        pieceIssues.add(
          ['pieces', i, 'routes'],
          `every route must include the trunk "${piece.trunk}"`,
        );
      }
      if (piece.routes.length < 2) {
        pieceIssues.add(['pieces', i, 'routes'], 'stateful pieces need at least two routes');
      }
      if ((piece.defaultState ?? 0) >= piece.routes.length) {
        pieceIssues.add(['pieces', i, 'defaultState'], 'defaultState is out of range');
      }
    }
  });

  trains.value.wagons.forEach((wagon, i) => {
    wagon.accepts.forEach((id, j) => {
      if (!catalogs.cargoTypes[id])
        trainIssues.add(['wagons', i, 'accepts', j], `unknown cargo "${id}"`);
    });
  });

  const issues = [terrainIssues, objectIssues, pieceIssues, trainIssues, cargoIssues].flatMap(
    (group) => group.list,
  );
  return issues.length ? { ok: false, issues } : { ok: true, value: catalogs };
}

// ---------------------------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------------------------

function checkMapSize(name: 'widthPx' | 'heightPx', value: number, issues: Issues): boolean {
  if (value % CELL_SIZE !== 0) {
    issues.add(['map', name], `${name} must be a multiple of ${CELL_SIZE}`);
    return false;
  }
  if (value < MAP_MIN_PX || value > MAP_MAX_PX) {
    issues.add(['map', name], `${name} must be between ${MAP_MIN_PX} and ${MAP_MAX_PX}`);
    return false;
  }
  return true;
}

/** Direction of a straight line of cells, or null if the cells are not a contiguous line. */
function lineAxis(cells: readonly Cell[]): 'vertical' | 'horizontal' | 'single' | null {
  if (cells.length === 1) return 'single';
  const xs = new Set(cells.map((c) => c.x));
  const ys = new Set(cells.map((c) => c.y));
  const contiguous = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.every((v, i) => i === 0 || v === (sorted[i - 1] ?? v) + 1);
  };
  if (xs.size === 1 && contiguous(cells.map((c) => c.y))) return 'vertical';
  if (ys.size === 1 && contiguous(cells.map((c) => c.x))) return 'horizontal';
  return null;
}

export function validateLevel(raw: unknown, catalogs: Catalogs, source = 'level'): Result<Level> {
  const parsed = parse(levelSchema, raw, source);
  if (!parsed.ok) return parsed;
  const level = parsed.value;
  const issues = new Issues(source);
  const { map } = level;
  const known = (kind: keyof Catalogs, id: string) => catalogs[kind][id] !== undefined;
  const requireId = (kind: keyof Catalogs, label: string, id: string, path: PropertyKey[]) => {
    if (!known(kind, id)) issues.add(path, `unknown ${label} "${id}"`);
  };

  const sizeOk =
    checkMapSize('widthPx', map.widthPx, issues) && checkMapSize('heightPx', map.heightPx, issues);

  requireId('terrains', 'terrain', map.defaultTerrain, ['map', 'defaultTerrain']);
  map.terrainPatches.forEach((patch, i) => {
    requireId('terrains', 'terrain', patch.terrain, ['map', 'terrainPatches', i, 'terrain']);
  });

  // Checks below need a valid grid.
  if (!sizeOk) return { ok: false, issues: issues.list };
  const dims = gridDims(map.widthPx, map.heightPx);
  map.terrainPatches.forEach((patch, i) => {
    const { x, y, w, h } = patch.rect;
    if (!inBounds(dims, { x, y }) || !inBounds(dims, { x: x + w - 1, y: y + h - 1 })) {
      issues.add(['map', 'terrainPatches', i, 'rect'], 'patch is outside the map');
    }
  });
  const terrain = paintTerrain(dims, map.defaultTerrain, map.terrainPatches);
  const terrainOf = (cell: Cell) => catalogs.terrains[terrain[cellIndex(dims, cell)] ?? ''];

  // Objects
  const blocked = new Set<string>();
  const occupiedByObject = new Set<string>();
  map.objects.forEach((placed, i) => {
    const path = ['map', 'objects', i];
    const def = catalogs.objects[placed.type];
    if (!def) {
      issues.add([...path, 'type'], `unknown object "${placed.type}"`);
      return;
    }
    const cells = footprintCells(placed.at, def.footprint.w, def.footprint.h);
    if (!cells.every((c) => inBounds(dims, c))) {
      issues.add([...path, 'at'], `object "${placed.type}" does not fit inside the map`);
      return;
    }
    for (const cell of cells) {
      const t = terrainOf(cell);
      const allowed = def.allowedTerrains
        ? def.allowedTerrains.includes(t?.id ?? '')
        : (t?.buildable ?? false);
      if (!allowed) {
        issues.add([...path, 'at'], `object "${placed.type}" is not allowed on terrain "${t?.id}"`);
        break;
      }
    }
    for (const cell of cells) {
      const key = cellKey(cell);
      if (occupiedByObject.has(key)) {
        issues.add([...path, 'at'], `objects overlap at (${cell.x},${cell.y})`);
        break;
      }
      occupiedByObject.add(key);
      if (def.blocksTrack) blocked.add(key);
    }
  });

  // Tracks
  const tracks = new Map<string, { piece: string; rotation: number }>();
  map.tracks.forEach((track, i) => {
    const path = ['map', 'tracks', i];
    const piece = catalogs.pieces[track.piece];
    const key = cellKey(track.at);
    if (!piece) {
      issues.add([...path, 'piece'], `unknown piece "${track.piece}"`);
      return;
    }
    if (!isValidRotation(track.rotation, FEATURES.diagonals)) {
      issues.add([...path, 'rotation'], `invalid rotation ${track.rotation}`);
      return;
    }
    if (!inBounds(dims, track.at)) {
      issues.add([...path, 'at'], 'track is outside the map');
      return;
    }
    if (!terrainOf(track.at)?.buildable) issues.add([...path, 'at'], 'Terrain not buildable');
    if (blocked.has(key)) issues.add([...path, 'at'], 'Cell occupied');
    if (tracks.has(key)) issues.add([...path, 'at'], `two tracks at (${track.at.x},${track.at.y})`);
    if (track.state !== undefined && track.state >= (piece.stateful ? piece.routes.length : 1)) {
      issues.add([...path, 'state'], 'state is out of range');
    }
    tracks.set(key, { piece: track.piece, rotation: track.rotation });
  });

  // Stations
  const stationIds = new Set<string>();
  const stationCells = new Set<string>();
  map.stations.forEach((station, i) => {
    const path = ['map', 'stations', i];
    if (stationIds.has(station.id)) issues.add([...path, 'id'], `duplicate id: ${station.id}`);
    stationIds.add(station.id);

    const axis = lineAxis(station.cells);
    if (axis === null) {
      issues.add([...path, 'cells'], 'station cells must form a contiguous straight line');
    }
    station.cells.forEach((cell, j) => {
      const key = cellKey(cell);
      if (stationCells.has(key))
        issues.add([...path, 'cells', j], 'cell already belongs to a station');
      stationCells.add(key);
      const track = tracks.get(key);
      const piece = track && catalogs.pieces[track.piece];
      if (!track || !piece?.isStation) {
        issues.add([...path, 'cells', j], 'station cells need a platform track (isStation piece)');
        return;
      }
      const ports = piecePorts(piece, track.rotation);
      const along: Port = axis === 'horizontal' ? 'E' : 'N';
      if (axis !== 'single' && !(ports.includes(along) && ports.includes(oppositePort(along)))) {
        issues.add([...path, 'cells', j], 'platform track must run along the station');
      }
    });
    station.supplies.forEach((s, j) => {
      requireId('cargoTypes', 'cargo', s.cargo, [...path, 'supplies', j, 'cargo']);
    });
    station.demands.forEach((d, j) => {
      requireId('cargoTypes', 'cargo', d.cargo, [...path, 'demands', j, 'cargo']);
    });
  });

  // Rules, economy, objectives
  const { editorRules: rules } = level;
  rules.allowedPieces?.forEach((id, i) => {
    requireId('pieces', 'piece', id, ['editorRules', 'allowedPieces', i]);
  });
  rules.allowedLocomotives?.forEach((id, i) => {
    requireId('locomotives', 'locomotive', id, ['editorRules', 'allowedLocomotives', i]);
  });
  rules.allowedWagons?.forEach((id, i) => {
    requireId('wagons', 'wagon', id, ['editorRules', 'allowedWagons', i]);
  });
  Object.keys(level.economy.payOverrides).forEach((id) => {
    requireId('cargoTypes', 'cargo', id, ['economy', 'payOverrides', id]);
  });
  level.objectives.forEach((objective, i) => {
    const path = ['objectives', i];
    requireId('cargoTypes', 'cargo', objective.cargo, [...path, 'cargo']);
    for (const field of ['to', 'from'] as const) {
      const id = objective[field];
      if (id !== undefined && !stationIds.has(id)) {
        issues.add([...path, field], `unknown station "${id}"`);
      }
    }
  });
  level.scoring.stars.forEach((tier, i) => {
    const previous = level.scoring.stars[i - 1];
    if (previous && tier.stars >= previous.stars) {
      issues.add(['scoring', 'stars', i, 'stars'], 'star tiers must be listed from best to worst');
    }
  });

  return issues.list.length ? { ok: false, issues: issues.list } : { ok: true, value: level };
}

export function validateLevelIndex(raw: unknown): Result<LevelIndex> {
  const parsed = parse(levelIndexSchema, raw, 'levels/index.json');
  if (!parsed.ok) return parsed;
  const issues = new Issues('levels/index.json');
  indexById(parsed.value.levels, ['levels'], issues);
  return issues.list.length ? { ok: false, issues: issues.list } : parsed;
}
