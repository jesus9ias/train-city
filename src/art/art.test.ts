import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RAW_CATALOGS } from '../data/loader';
import { trackPiecesFileSchema } from '../data/schemas/catalogs';
import { packAtlas } from './atlas';
import { buildAtlases } from './atlases';
import { PixelCanvas } from './canvas';
import { PALETTE, inPalette } from './palette';
import { decodePng, encodePng } from './png';
import { VEHICLE_FACINGS, vehicleFrames } from './vehicles';

const pieces = trackPiecesFileSchema.parse(RAW_CATALOGS.trackPieces).pieces;
const atlases = buildAtlases(pieces);
/** Tests run from the project root (jsdom's import.meta.url is not a file URL). */
const atlasFile = (name: string) => resolve(process.cwd(), 'public/assets/atlases', name);

describe('palette (ADR-002)', () => {
  it('has 32 distinct colors', () => {
    const colors = Object.values(PALETTE).map((c) => c.toLowerCase());
    expect(new Set(colors).size).toBe(32);
    expect(inPalette('#3E8948')).toBe(true);
    expect(inPalette('#123456')).toBe(false);
  });
});

describe('PixelCanvas', () => {
  it('paints only inside its bounds and can erase', () => {
    const c = new PixelCanvas(3, 2);
    c.set(-1, 0, 'red');
    c.set(3, 0, 'red');
    c.set(1, 1, 'red');
    expect(c.get(1, 1)).toBe(PALETTE.red);
    expect(c.get(0, 0)).toBeNull();
    c.set(1, 1, null);
    expect(c.isOpaque(1, 1)).toBe(false);
  });

  it('turns losslessly: four quarter turns are the identity', () => {
    const c = new PixelCanvas(3, 2);
    c.set(0, 0, 'red');
    c.set(2, 1, 'blue');
    const turned = c.rotated(1);
    expect([turned.width, turned.height]).toEqual([2, 3]);
    expect(turned.get(1, 0)).toBe(PALETTE.red); // top-left goes to top-right
    expect(c.rotated(4).data).toEqual(c.data);
    expect(c.rotated(1).rotated(1).rotated(1).rotated(1).data).toEqual(c.data);
    expect(c.rotated(-1).data).toEqual(c.rotated(3).data);
  });

  it('draws shapes and copies canvases over others', () => {
    const c = new PixelCanvas(8, 8);
    c.frame(0, 0, 8, 8, 'black');
    c.rect(2, 2, 2, 2, 'lime');
    c.disc(6, 6, 1, 'red');
    const target = new PixelCanvas(10, 10);
    target.draw(c, 5, 5); // partly outside: clipped
    expect(target.get(5, 5)).toBe(PALETTE.black);
    expect(target.get(7, 7)).toBe(PALETTE.lime);
    expect(target.get(0, 0)).toBeNull();
  });
});

describe('PNG codec', () => {
  it('round-trips pixels', () => {
    const c = new PixelCanvas(5, 4);
    c.rect(1, 1, 3, 2, 'amber');
    expect(decodePng(encodePng(c)).data).toEqual(c.data);
  });
});

describe('atlases', () => {
  it('every pixel of every frame is in the palette or transparent', () => {
    for (const { image } of atlases.values()) {
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const color = image.get(x, y);
          if (color !== null && !inPalette(color)) {
            throw new Error(`${color} at ${x},${y} is not in the palette`);
          }
          if (image.isOpaque(x, y)) expect(image.data[(y * image.width + x) * 4 + 3]).toBe(255);
        }
      }
    }
  });

  it('packs frames without overlaps, inside the sheet and at most 2048 px', () => {
    for (const { image, json } of atlases.values()) {
      expect(image.width).toBeLessThanOrEqual(2048);
      expect(image.height).toBeLessThanOrEqual(2048);
      const rects = Object.values(json.frames).map((f) => f.frame);
      for (const [i, a] of rects.entries()) {
        expect(a.x + a.w).toBeLessThanOrEqual(image.width);
        expect(a.y + a.h).toBeLessThanOrEqual(image.height);
        for (const b of rects.slice(i + 1)) {
          const apart =
            a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it('wraps to a new row when a row is full', () => {
    const frames = new Map(
      Array.from({ length: 20 }, (_, i) => [`f${i}`, new PixelCanvas(20, 20)] as const),
    );
    const { json } = packAtlas('test', frames);
    expect(json.meta.size.w).toBeLessThanOrEqual(256);
    expect(json.frames['f19']?.frame.y).toBeGreaterThan(0);
  });

  it('vehicles have one frame per facing, each a quarter turn of the north one', () => {
    const frames = vehicleFrames();
    const north = frames.get('loco_steam_N');
    expect(north).toBeDefined();
    VEHICLE_FACINGS.forEach((facing, turns) => {
      expect(frames.get(`loco_steam_${facing}`)?.data).toEqual(north?.rotated(turns).data);
    });
  });

  it('the committed atlases are up to date (run `pnpm art` after changing sprites)', () => {
    for (const [family, { image, json }] of atlases) {
      const png = decodePng(readFileSync(atlasFile(`${family}.png`)));
      expect([png.width, png.height], family).toEqual([image.width, image.height]);
      expect(Buffer.from(png.data).equals(Buffer.from(image.data)), `${family}.png`).toBe(true);
      const committed: unknown = JSON.parse(readFileSync(atlasFile(`${family}.json`), 'utf8'));
      expect(committed, `${family}.json`).toEqual(json);
    }
  });
});
