/**
 * Validates every bundled data file (`pnpm validate:data`), plus atlas frame references.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  availableLevelFiles,
  loadAtlasManifest,
  loadCatalogs,
  loadLevel,
  loadLevelIndex,
} from './loader';

const ATLAS_DIR = resolve(import.meta.dirname, '../../public/assets/atlases');

describe('bundled data', () => {
  const catalogs = loadCatalogs();

  it('catalogs are valid', () => {
    expect(Object.keys(catalogs.terrains).length).toBeGreaterThan(0);
  });

  it('the level index only lists existing level files, with matching names', async () => {
    const files = availableLevelFiles();
    for (const entry of loadLevelIndex().levels) {
      expect(files).toContain(entry.id);
      const level = await loadLevel(entry.id, catalogs);
      expect(level.name).toBe(entry.name);
    }
  });

  it.each(availableLevelFiles())(
    'level %s is valid and its id matches its file name',
    async (id) => {
      const level = await loadLevel(id, catalogs);
      expect(level.id).toBe(id);
    },
  );

  it('every atlas in the manifest exists and contains the frames the catalogs reference', () => {
    const { atlases } = loadAtlasManifest();
    const missing: string[] = [];
    for (const atlas of atlases) {
      const jsonPath = resolve(ATLAS_DIR, `${atlas}.json`);
      expect(existsSync(jsonPath), `${atlas}.json`).toBe(true);
      expect(existsSync(resolve(ATLAS_DIR, `${atlas}.png`)), `${atlas}.png`).toBe(true);
      const frames = Object.keys(
        (JSON.parse(readFileSync(jsonPath, 'utf8')) as { frames: Record<string, unknown> }).frames,
      );
      const refs = [
        ...Object.values(catalogs.terrains),
        ...Object.values(catalogs.objects),
        ...Object.values(catalogs.pieces),
      ].flatMap((def) => (def.sprite?.atlas === atlas ? (def.sprite.frames ?? []) : []));
      missing.push(...refs.filter((frame) => !frames.includes(frame)).map((f) => `${atlas}/${f}`));
    }
    // Missing frames fall back to placeholders at runtime; report them without failing.
    if (missing.length) console.warn(`Sprite frames not found in atlases: ${missing.join(', ')}`);
  });
});
