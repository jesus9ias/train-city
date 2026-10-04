import { PixelCanvas } from './canvas';

/** A packed sprite sheet plus its frame table in Phaser's JSON-hash format. */
export type PackedAtlas = {
  readonly image: PixelCanvas;
  readonly json: AtlasJson;
};

export type AtlasFrame = {
  readonly frame: { x: number; y: number; w: number; h: number };
  readonly rotated: false;
  readonly trimmed: false;
  readonly spriteSourceSize: { x: 0; y: 0; w: number; h: number };
  readonly sourceSize: { w: number; h: number };
};

export type AtlasJson = {
  readonly frames: Readonly<Record<string, AtlasFrame>>;
  readonly meta: {
    readonly app: string;
    readonly image: string;
    readonly format: 'RGBA8888';
    readonly size: { w: number; h: number };
    readonly scale: '1';
  };
};

/** Transparent gap between frames, so sampling never bleeds into a neighbor. */
const PADDING = 1;
const MAX_WIDTH = 256;

/**
 * Shelf packing: frames sorted by height (stable, so the output is deterministic) and laid out
 * in rows no wider than MAX_WIDTH.
 */
export function packAtlas(name: string, frames: ReadonlyMap<string, PixelCanvas>): PackedAtlas {
  const entries = [...frames].sort((a, b) => b[1].height - a[1].height);
  const placed: { name: string; canvas: PixelCanvas; x: number; y: number }[] = [];
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let width = 0;
  for (const [frameName, canvas] of entries) {
    if (x + canvas.width + PADDING > MAX_WIDTH && x > PADDING) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    placed.push({ name: frameName, canvas, x, y });
    x += canvas.width + PADDING;
    rowHeight = Math.max(rowHeight, canvas.height);
    width = Math.max(width, x);
  }
  const height = y + rowHeight + PADDING;

  const image = new PixelCanvas(width, height);
  const table: Record<string, AtlasFrame> = {};
  for (const { name: frameName, canvas, x: fx, y: fy } of placed) {
    image.draw(canvas, fx, fy);
    const w = canvas.width;
    const h = canvas.height;
    table[frameName] = {
      frame: { x: fx, y: fy, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
  }
  return {
    image,
    json: {
      frames: table,
      meta: {
        app: 'train-city art generator (src/art)',
        image: `${name}.png`,
        format: 'RGBA8888',
        size: { w: width, h: height },
        scale: '1',
      },
    },
  };
}
