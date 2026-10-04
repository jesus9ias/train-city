import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inPalette } from '../art/palette';
import { rotationStep } from '../core/track/rotation';
import { loadAtlasManifest, loadCatalogs } from './loader';
import type { SpriteRef } from './schemas/common';

const FACINGS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const catalogs = loadCatalogs();
const manifest = loadAtlasManifest();

function framesOf(atlas: string): Set<string> {
  const file = resolve(process.cwd(), 'public/assets/atlases', `${atlas}.json`);
  const json = JSON.parse(readFileSync(file, 'utf8')) as { frames: Record<string, unknown> };
  return new Set(Object.keys(json.frames));
}

/** Every frame a catalog sprite can ask for. */
function referencedFrames(): { atlas: string; frame: string; owner: string }[] {
  const out: { atlas: string; frame: string; owner: string }[] = [];
  const add = (owner: string, sprite: SpriteRef | undefined, suffixes: readonly string[]) => {
    if (!sprite) return;
    for (const frame of sprite.frames ?? []) out.push({ atlas: sprite.atlas, frame, owner });
    if (sprite.prefix) {
      for (const s of suffixes)
        out.push({ atlas: sprite.atlas, frame: `${sprite.prefix}_${s}`, owner });
    }
  };
  for (const t of Object.values(catalogs.terrains)) add(t.id, t.sprite, []);
  for (const o of Object.values(catalogs.objects)) add(o.id, o.sprite, []);
  for (const p of Object.values(catalogs.pieces)) {
    const states = p.stateful ? p.routes.map((_, i) => String(i)) : ['0'];
    const diagonal = rotationStep(p) === 45 ? states.map((s) => `${s}_d`) : [];
    add(p.id, p.sprite, [...states, ...diagonal]);
  }
  for (const v of [...Object.values(catalogs.locomotives), ...Object.values(catalogs.wagons)]) {
    add(v.id, v.sprite, FACINGS);
  }
  return out;
}

describe('art data (spec.md §4.14)', () => {
  it('ships every atlas family listed in atlases.json', () => {
    expect(manifest.atlases).toEqual(['terrain', 'objects', 'tracks', 'vehicles', 'ui']);
    for (const atlas of manifest.atlases) expect(framesOf(atlas).size).toBeGreaterThan(0);
  });

  it('every frame referenced by the bundled catalogs exists in its atlas', () => {
    const missing = referencedFrames().filter(({ atlas, frame }) => !framesOf(atlas).has(frame));
    expect(missing).toEqual([]);
  });

  it('every bundled catalog entry has a sprite and a palette color', () => {
    const colors = [
      ...Object.values(catalogs.terrains).map((t) => [t.id, t.color, t.sprite] as const),
      ...Object.values(catalogs.objects).map((o) => [o.id, o.render.color, o.sprite] as const),
      ...Object.values(catalogs.locomotives).map((l) => [l.id, l.render.color, l.sprite] as const),
      ...Object.values(catalogs.wagons).map((w) => [w.id, w.render.color, w.sprite] as const),
    ];
    for (const [id, color, sprite] of colors) {
      expect(inPalette(color), `${id}: ${color}`).toBe(true);
      expect(sprite, id).toBeDefined();
    }
    for (const piece of Object.values(catalogs.pieces))
      expect(piece.sprite, piece.id).toBeDefined();
  });
});
