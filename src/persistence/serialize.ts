import { FEATURES } from '../core/constants';
import type { GameState } from '../core/game/state';
import { isValidRotation } from '../core/grid/ports';
import { hashString } from '../core/grid/variant';
import { cellKey, footprintCells, gridDims, inBounds } from '../core/world/world';
import type { Catalogs } from '../data/schemas/catalogs';
import type { Level } from '../data/schemas/level';
import {
  CURRENT_SAVE_VERSION,
  SAVE_FORMAT,
  saveHeaderSchema,
  saveSchema,
  type SaveGame,
} from '../data/schemas/save';
import { formatPath, type Issue, type Result } from '../data/validate';
import { migrate } from './migrations';
import { decodeRuns, encodeRuns } from './rle';

/** Max size of an imported save, in bytes (spec.md §12.4). */
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;

/** Stable fingerprint of a level definition, to detect saves made with an older level. */
export function levelHash(level: Level): string {
  return `fnv1a:${hashString(JSON.stringify(level)).toString(16).padStart(8, '0')}`;
}

export function gameToSave(
  game: GameState,
  level: Level,
  meta: { gameVersion: string; savedAt: Date },
): SaveGame {
  const { world } = game;
  return {
    format: SAVE_FORMAT,
    schemaVersion: CURRENT_SAVE_VERSION,
    gameVersion: meta.gameVersion,
    savedAt: meta.savedAt.toISOString(),
    levelId: level.id,
    levelHash: levelHash(level),
    mode: game.mode,
    world: {
      widthPx: world.widthPx,
      heightPx: world.heightPx,
      terrain: encodeRuns(world.terrain),
      objects: world.objects.map((o) => ({ ...o })),
      tracks: world.tracks.map((t) => ({ ...t })),
      stations: [...world.stations],
      trains: game.trains.map((t) => ({
        ...t,
        wagons: t.wagons.map((w) => ({ ...w })),
        trail: [...t.trail],
      })),
    },
    run: {
      elapsedTicks: game.elapsedTicks,
      paused: game.paused,
      inventories: game.run.inventories,
      delivered: game.run.delivered,
      lost: game.run.lost,
      fuelUsedTotal: game.run.fuelUsedTotal,
      fuelUsedByTrain: game.run.fuelUsedByTrain,
      fuelBoughtTotal: game.run.fuelBoughtTotal,
      outcome: game.run.outcome,
    },
    economy: { initialMoney: game.initialMoney, ledger: { ...game.ledger } },
    editor: {
      session: game.editorSession,
      nextObjectId: game.nextObjectId,
      nextTrainId: game.nextTrainId,
    },
  };
}

const fail = <T>(issues: Issue[]): Result<T> => ({ ok: false, issues });

/** JSON text → validated, migrated save. Never throws. */
export function parseSaveText(text: string): Result<SaveGame> {
  if (text.length > MAX_SAVE_BYTES) {
    return fail([{ path: '', message: 'File is too large (max 5 MB)' }]);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail([{ path: '', message: 'Not valid JSON' }]);
  }
  const header = saveHeaderSchema.safeParse(raw);
  if (!header.success) {
    return fail(header.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
  }
  const migrated = migrate(header.data);
  if (!migrated.ok) return migrated;
  const parsed = saveSchema.safeParse(migrated.value);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message })));
  }
  return { ok: true, value: parsed.data };
}

/** Rebuilds a game state from a save, checking it against its level and the catalogs. */
export function saveToGame(save: SaveGame, level: Level, catalogs: Catalogs): Result<GameState> {
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  const { world } = save;

  if (save.levelId !== level.id) add('levelId', `save is for level "${save.levelId}"`);
  if (world.widthPx !== level.map.widthPx || world.heightPx !== level.map.heightPx) {
    add('world', 'map size does not match the level');
    return fail(issues);
  }
  const dims = gridDims(world.widthPx, world.heightPx);
  const terrain = decodeRuns(world.terrain);
  if (terrain.length !== dims.cols * dims.rows) {
    add('world.terrain', `expected ${dims.cols * dims.rows} cells, got ${terrain.length}`);
  }
  world.terrain.forEach(([id], i) => {
    if (!catalogs.terrains[id]) add(`world.terrain[${i}]`, `unknown terrain "${id}"`);
  });

  const objectIds = new Set<string>();
  world.objects.forEach((o, i) => {
    const def = catalogs.objects[o.type];
    if (!def) return add(`world.objects[${i}].type`, `unknown object "${o.type}"`);
    if (objectIds.has(o.id)) add(`world.objects[${i}].id`, `duplicate id: ${o.id}`);
    objectIds.add(o.id);
    if (!footprintCells(o.at, def.footprint.w, def.footprint.h).every((c) => inBounds(dims, c))) {
      add(`world.objects[${i}].at`, 'object is outside the map');
    }
  });

  const trackCells = new Set<string>();
  world.tracks.forEach((t, i) => {
    const piece = catalogs.pieces[t.piece];
    if (!piece) return add(`world.tracks[${i}].piece`, `unknown piece "${t.piece}"`);
    if (!inBounds(dims, t.at)) add(`world.tracks[${i}].at`, 'track is outside the map');
    if (!isValidRotation(t.rotation, FEATURES.diagonals)) {
      add(`world.tracks[${i}].rotation`, `invalid rotation ${t.rotation}`);
    }
    if (t.state >= (piece.stateful ? piece.routes.length : 1)) {
      add(`world.tracks[${i}].state`, 'state is out of range');
    }
    const key = cellKey(t.at);
    if (trackCells.has(key)) add(`world.tracks[${i}].at`, `two tracks at (${t.at.x},${t.at.y})`);
    trackCells.add(key);
  });

  const trainIds = new Set<string>();
  const occupied = new Set<string>();
  world.trains.forEach((t, i) => {
    const path = `world.trains[${i}]`;
    if (!catalogs.locomotives[t.locomotive]) {
      add(`${path}.locomotive`, `unknown locomotive "${t.locomotive}"`);
    }
    t.wagons.forEach((w, j) => {
      if (!catalogs.wagons[w.model])
        add(`${path}.wagons[${j}].model`, `unknown wagon "${w.model}"`);
    });
    if (t.trail.length !== t.wagons.length)
      add(`${path}.trail`, 'one trail cell per wagon expected');
    if (trainIds.has(t.id)) add(`${path}.id`, `duplicate id: ${t.id}`);
    trainIds.add(t.id);
    for (const pass of [t.head, ...t.trail]) {
      const key = cellKey(pass.cell);
      if (!trackCells.has(key))
        add(path, `train is off the track at (${pass.cell.x},${pass.cell.y})`);
      if (occupied.has(key)) add(path, `two vehicles at (${pass.cell.x},${pass.cell.y})`);
      occupied.add(key);
    }
  });

  if (issues.length) return fail(issues);
  return {
    ok: true,
    value: {
      world: {
        widthPx: world.widthPx,
        heightPx: world.heightPx,
        ...dims,
        terrain,
        objects: world.objects,
        tracks: world.tracks,
        stations: world.stations,
      },
      trains: world.trains,
      run: {
        inventories: save.run.inventories,
        delivered: save.run.delivered,
        lost: save.run.lost,
        fuelUsedTotal: save.run.fuelUsedTotal,
        fuelUsedByTrain: save.run.fuelUsedByTrain,
        fuelBoughtTotal: save.run.fuelBoughtTotal,
        outcome: save.run.outcome,
      },
      ledger: save.economy.ledger,
      initialMoney: save.economy.initialMoney,
      mode: save.mode,
      // A game saved while running reopens paused (spec.md §8.10 "Restore on reload").
      paused: save.mode === 'running' ? true : save.run.paused,
      elapsedTicks: save.run.elapsedTicks,
      editorSession: save.editor.session,
      nextObjectId: save.editor.nextObjectId,
      nextTrainId: save.editor.nextTrainId,
    },
  };
}
