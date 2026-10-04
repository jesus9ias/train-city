import { CELL_SIZE } from '../core/constants';
import { hashString, variantIndex } from '../core/grid/variant';
import { PixelCanvas } from './canvas';
import type { PaletteColor } from './palette';

/** Terrain variants per terrain type (spec.md §4.14: 2–4). */
export const TERRAIN_VARIANTS = 3;

type TerrainStyle = {
  readonly base: PaletteColor;
  /** Speckle colors and how many pixels in 100 get each. */
  readonly speckles: readonly (readonly [PaletteColor, number])[];
  /** Small details stamped on some variants. */
  readonly detail?: (canvas: PixelCanvas, variant: number, salt: number) => void;
};

/** A few pixels in a deterministic spot of the tile. */
const spot = (variant: number, salt: number, i: number): [number, number] => [
  2 + variantIndex(variant, i, CELL_SIZE - 5, salt),
  2 + variantIndex(i, variant, CELL_SIZE - 5, salt + 1),
];

const STYLES: Readonly<Record<string, TerrainStyle>> = {
  grass: {
    base: 'green',
    speckles: [
      ['lime', 4],
      ['forest', 4],
    ],
    detail: (c, variant, salt) => {
      // Grass tufts, and a flower on one variant.
      for (let i = 0; i < 2; i++) {
        const [x, y] = spot(variant, salt, i);
        c.set(x, y, 'lime');
        c.set(x - 1, y + 1, 'lime');
        c.set(x + 1, y + 1, 'lime');
      }
      if (variant === 2) {
        const [x, y] = spot(variant, salt, 5);
        c.set(x, y, 'yellow');
      }
    },
  },
  dirt: {
    base: 'clay',
    speckles: [
      ['bark', 4],
      ['copper', 5],
    ],
    detail: (c, variant, salt) => {
      const [x, y] = spot(variant, salt, 3);
      c.set(x, y, 'tan');
      c.set(x + 1, y, 'bark');
    },
  },
  desert: {
    base: 'sand',
    speckles: [
      ['tan', 5],
      ['peach', 3],
    ],
    detail: (c, variant, salt) => {
      // Wind ripples.
      const [x, y] = spot(variant, salt, 2);
      for (let i = 0; i < 4; i++) c.set(x + i, y + (i === 1 || i === 2 ? -1 : 0), 'tan');
    },
  },
  snow: {
    base: 'white',
    speckles: [['silver', 5]],
    detail: (c, variant, salt) => {
      if (variant === 0) return;
      const [x, y] = spot(variant, salt, 4);
      c.set(x, y, 'steel');
    },
  },
  water: {
    base: 'blue',
    speckles: [['navy', 3]],
    detail: (c, variant, salt) => {
      // Short wave crests.
      for (let i = 0; i < 2; i++) {
        const [x, y] = spot(variant, salt, i + 7);
        c.set(x, y, 'cyan');
        c.set(x + 1, y - 1, 'cyan');
        c.set(x + 2, y, 'cyan');
      }
    },
  },
};

/** Terrain ids that have authored art. */
export const TERRAIN_IDS = Object.keys(STYLES);

/** Frames `<terrain>_<variant>`, each one cell. */
export function terrainFrames(): Map<string, PixelCanvas> {
  const frames = new Map<string, PixelCanvas>();
  for (const [id, style] of Object.entries(STYLES)) {
    const salt = hashString(id);
    for (let variant = 0; variant < TERRAIN_VARIANTS; variant++) {
      const canvas = new PixelCanvas(CELL_SIZE, CELL_SIZE);
      canvas.rect(0, 0, CELL_SIZE, CELL_SIZE, style.base);
      for (let y = 0; y < CELL_SIZE; y++) {
        for (let x = 0; x < CELL_SIZE; x++) {
          let roll = variantIndex(x, y, 100, salt + variant * 7919);
          for (const [color, weight] of style.speckles) {
            if (roll < weight) {
              canvas.set(x, y, color);
              break;
            }
            roll -= weight;
          }
        }
      }
      style.detail?.(canvas, variant, salt);
      frames.set(`${id}_${variant}`, canvas);
    }
  }
  return frames;
}
