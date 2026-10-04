/**
 * Regenerates public/assets/atlases/*.png + *.json from the sprite code in src/art and lists
 * them in src/data/atlases.json. Run with `pnpm art` after changing any sprite.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { buildAtlases } from '../src/art/atlases';
import { encodePng } from '../src/art/png';
import pieces from '../src/data/catalogs/track-pieces.json';
import { trackPiecesFileSchema } from '../src/data/schemas/catalogs';

const out = new URL('../public/assets/atlases/', import.meta.url);
mkdirSync(out, { recursive: true });

const atlases = buildAtlases(trackPiecesFileSchema.parse(pieces).pieces);
for (const [family, { image, json }] of atlases) {
  writeFileSync(new URL(`${family}.png`, out), encodePng(image));
  writeFileSync(new URL(`${family}.json`, out), `${JSON.stringify(json, null, 2)}\n`);
  console.warn(
    `${family}: ${Object.keys(json.frames).length} frames, ${image.width}×${image.height}`,
  );
}

const manifest = { schemaVersion: 1, atlases: [...atlases.keys()] };
writeFileSync(
  new URL('../src/data/atlases.json', import.meta.url),
  await format(JSON.stringify(manifest), { parser: 'json' }),
);
