import atlases from './atlases.json';
import cargoTypes from './catalogs/cargo-types.json';
import objects from './catalogs/objects.json';
import terrains from './catalogs/terrains.json';
import trackPieces from './catalogs/track-pieces.json';
import trainModels from './catalogs/train-models.json';
import levelIndex from './levels/index.json';
import { atlasManifestSchema, type AtlasManifest, type Catalogs } from './schemas/catalogs';
import type { Level, LevelIndex } from './schemas/level';
import { DataError, validateCatalogs, validateLevel, validateLevelIndex } from './validate';

/** Raw catalog files bundled with the game. */
export const RAW_CATALOGS = { terrains, objects, trackPieces, trainModels, cargoTypes };

/** Level files are loaded on demand (spec.md §12.3). */
const levelModules = import.meta.glob<unknown>(['./levels/*.json', '!./levels/index.json'], {
  import: 'default',
});

export function loadCatalogs(): Catalogs {
  const result = validateCatalogs(RAW_CATALOGS);
  if (!result.ok) throw new DataError('catalogs', result.issues);
  return result.value;
}

export function loadAtlasManifest(): AtlasManifest {
  return atlasManifestSchema.parse(atlases);
}

export function loadLevelIndex(): LevelIndex {
  const result = validateLevelIndex(levelIndex);
  if (!result.ok) throw new DataError('levels/index.json', result.issues);
  return result.value;
}

export function availableLevelFiles(): string[] {
  return Object.keys(levelModules).map((path) => path.replace(/^.*\/(.+)\.json$/, '$1'));
}

export async function loadLevel(id: string, catalogs: Catalogs): Promise<Level> {
  const load = levelModules[`./levels/${id}.json`];
  if (!load)
    throw new DataError(`levels/${id}.json`, [{ path: '', message: `unknown level "${id}"` }]);
  const result = validateLevel(await load(), catalogs, `levels/${id}.json`);
  if (!result.ok) throw new DataError(`levels/${id}.json`, result.issues);
  return result.value;
}
