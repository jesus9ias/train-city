import type { Catalogs } from '../../data/schemas/catalogs';
import type { Level, StationDef } from '../../data/schemas/level';
import { CELL_SIZE } from '../constants';
import type { Cell } from '../grid/coords';

export type PlacedObject = {
  readonly id: string;
  readonly type: string;
  readonly at: Cell;
  readonly locked: boolean;
  /** Editor session that placed it; null for objects that come with the level. */
  readonly placedInSession: number | null;
};

export type PlacedTrack = {
  readonly at: Cell;
  readonly piece: string;
  readonly rotation: number;
  /** Active route index; always 0 for non-stateful pieces. */
  readonly state: number;
  readonly locked: boolean;
  /** Money paid for it (0 for tracks that come with the level). Base for refunds. */
  readonly paid: number;
  /** Editor session that placed it; null for tracks that come with the level. */
  readonly placedInSession: number | null;
};

/** The static world: map, terrain, objects, tracks and stations. Plain data, serializable. */
export type WorldState = {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly cols: number;
  readonly rows: number;
  /** Terrain id per cell, row-major (`y * cols + x`). */
  readonly terrain: readonly string[];
  readonly objects: readonly PlacedObject[];
  readonly tracks: readonly PlacedTrack[];
  readonly stations: readonly StationDef[];
};

export type GridDims = { readonly cols: number; readonly rows: number };
export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export function inBounds(dims: GridDims, cell: Cell): boolean {
  return cell.x >= 0 && cell.y >= 0 && cell.x < dims.cols && cell.y < dims.rows;
}

export function cellIndex(dims: GridDims, cell: Cell): number {
  return cell.y * dims.cols + cell.x;
}

export function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

export function terrainAt(world: WorldState, cell: Cell): string | undefined {
  return inBounds(world, cell) ? world.terrain[cellIndex(world, cell)] : undefined;
}

/** Cells covered by a footprint anchored at its top-left cell. */
export function footprintCells(at: Cell, w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) cells.push({ x: at.x + dx, y: at.y + dy });
  }
  return cells;
}

/** Terrain grid from a default terrain plus rectangular patches (later patches win, clipped). */
export function paintTerrain(
  dims: GridDims,
  defaultTerrain: string,
  patches: readonly { terrain: string; rect: Rect }[],
): string[] {
  const terrain = new Array<string>(dims.cols * dims.rows).fill(defaultTerrain);
  for (const { terrain: id, rect } of patches) {
    const x1 = Math.min(rect.x + rect.w, dims.cols);
    const y1 = Math.min(rect.y + rect.h, dims.rows);
    for (let y = rect.y; y < y1; y++) {
      for (let x = rect.x; x < x1; x++) terrain[y * dims.cols + x] = id;
    }
  }
  return terrain;
}

export function gridDims(widthPx: number, heightPx: number): GridDims {
  return { cols: Math.floor(widthPx / CELL_SIZE), rows: Math.floor(heightPx / CELL_SIZE) };
}

/** Builds the initial world of a level. Assumes the level was validated against the catalogs. */
export function buildWorld(level: Level, catalogs: Catalogs): WorldState {
  const { map } = level;
  const dims = gridDims(map.widthPx, map.heightPx);
  return {
    widthPx: map.widthPx,
    heightPx: map.heightPx,
    ...dims,
    terrain: paintTerrain(dims, map.defaultTerrain, map.terrainPatches),
    objects: map.objects.map((o, i) => ({
      id: `obj-${i + 1}`,
      type: o.type,
      at: o.at,
      locked: o.locked ?? false,
      placedInSession: null,
    })),
    tracks: map.tracks.map((t) => {
      const piece = catalogs.pieces[t.piece];
      const defaultState = piece?.stateful ? (piece.defaultState ?? 0) : 0;
      return {
        at: t.at,
        piece: t.piece,
        rotation: t.rotation,
        state: t.state ?? defaultState,
        locked: t.locked ?? false,
        paid: 0,
        placedInSession: null,
      };
    }),
    stations: map.stations,
  };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function trackAt(world: WorldState, cell: Cell): PlacedTrack | undefined {
  return world.tracks.find((t) => sameCell(t.at, cell));
}

/** The object covering `cell` (objects can span several cells). */
export function objectAt(
  world: WorldState,
  catalogs: Catalogs,
  cell: Cell,
): PlacedObject | undefined {
  return world.objects.find((o) => {
    const def = catalogs.objects[o.type];
    const w = def?.footprint.w ?? 1;
    const h = def?.footprint.h ?? 1;
    return cell.x >= o.at.x && cell.y >= o.at.y && cell.x < o.at.x + w && cell.y < o.at.y + h;
  });
}

export function stationAt(world: WorldState, cell: Cell): StationDef | undefined {
  return world.stations.find((s) => s.cells.some((c) => sameCell(c, cell)));
}
