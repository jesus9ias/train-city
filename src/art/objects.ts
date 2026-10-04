import { CELL_SIZE } from '../core/constants';
import { PixelCanvas } from './canvas';
import type { PaletteColor } from './palette';

/** Outline, shadow, base and highlight tones of a shaded volume. */
type Ramp = readonly [PaletteColor, PaletteColor, PaletteColor, PaletteColor];

/**
 * An ellipse lit from the top-left: outline on the rim, highlight and shadow by how much each
 * pixel faces the light.
 */
function shadedBlob(
  c: PixelCanvas,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  [outline, dark, base, light]: Ramp,
): void {
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.hypot(nx, ny);
      if (d > 1) continue;
      const rim = Math.hypot((x + 0.5 - cx) / (rx - 1), (y + 0.5 - cy) / (ry - 1)) > 1;
      const facing = -(nx + ny) * 0.7;
      c.set(x, y, rim ? outline : facing > 0.35 ? light : facing < -0.3 ? dark : base);
    }
  }
}

const LEAVES: Ramp = ['pine', 'forest', 'green', 'lime'];

function oak(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  c.rect(9, 13, 2, 5, 'bark');
  c.set(9, 17, 'plum');
  c.set(10, 17, 'plum');
  shadedBlob(c, 7, 9, 5, 5, LEAVES);
  shadedBlob(c, 13, 9, 5, 5, LEAVES);
  shadedBlob(c, 10, 6, 6, 5, LEAVES);
  return c;
}

function pine(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  c.rect(9, 15, 2, 4, 'bark');
  // Three stacked tiers, widest at the bottom.
  const tiers: [top: number, bottom: number, half: number][] = [
    [8, 16, 7],
    [4, 12, 5],
    [1, 8, 3],
  ];
  for (const [top, bottom, half] of tiers) {
    for (let y = top; y <= bottom; y++) {
      const w = Math.round(((y - top + 1) / (bottom - top + 1)) * half);
      for (let x = 10 - w; x < 10 + w; x++) {
        const edge = x === 10 - w || x === 10 + w - 1 || y === bottom;
        c.set(x, y, edge ? 'pine' : x < 10 ? 'green' : 'forest');
      }
    }
  }
  c.set(9, 2, 'lime');
  c.set(8, 6, 'lime');
  c.set(7, 10, 'lime');
  return c;
}

function cactus(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  const ramp: Ramp = ['pine', 'forest', 'green', 'lime'];
  const column = (x: number, top: number, bottom: number, w: number) => {
    for (let y = top; y <= bottom; y++) {
      for (let i = 0; i < w; i++) {
        const edge = i === 0 || i === w - 1 || y === top;
        c.set(x + i, y, edge ? ramp[0] : i === 1 ? ramp[3] : i === w - 2 ? ramp[1] : ramp[2]);
      }
    }
  };
  column(8, 2, 18, 5); // trunk
  column(3, 6, 12, 4); // left arm
  c.rect(6, 11, 3, 2, 'green');
  c.set(6, 13, 'pine');
  c.set(7, 13, 'pine');
  column(13, 4, 10, 4); // right arm
  c.rect(12, 9, 2, 2, 'green');
  for (const [x, y] of [
    [10, 5],
    [9, 9],
    [11, 13],
    [4, 8],
    [14, 6],
  ] as const) {
    c.set(x, y, 'sand'); // spines
  }
  return c;
}

function rock(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  shadedBlob(c, 9, 12, 7, 5, ['night', 'slate', 'steel', 'silver']);
  shadedBlob(c, 14, 14, 4, 3, ['night', 'slate', 'steel', 'silver']);
  c.set(7, 11, 'slate');
  c.set(8, 12, 'slate');
  return c;
}

/** A pitched roof seen from the front-top, with tiles every other row. */
function roof(
  c: PixelCanvas,
  x: number,
  y: number,
  w: number,
  h: number,
  [outline, dark, base, light]: Ramp,
) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const edge = i === 0 || i === w - 1 || j === 0 || j === h - 1;
      const ridge = j === Math.floor(h / 2);
      const color = edge
        ? outline
        : ridge
          ? light
          : j > h / 2
            ? (i + j) % 4 === 0
              ? outline
              : dark
            : (i + j) % 4 === 0
              ? dark
              : base;
      c.set(x + i, y + j, color);
    }
  }
}

function windowAt(c: PixelCanvas, x: number, y: number, lit = false) {
  c.frame(x, y, 4, 4, 'black');
  c.rect(x + 1, y + 1, 2, 2, lit ? 'yellow' : 'blue');
  c.set(x + 1, y + 1, lit ? 'white' : 'cyan');
}

function house(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE * 2, CELL_SIZE * 2);
  // Walls
  c.rect(4, 18, 32, 18, 'sand');
  c.frame(4, 18, 32, 18, 'black');
  for (let y = 21; y < 35; y += 3) c.rect(5, y, 30, 1, 'peach');
  roof(c, 2, 4, 36, 16, ['black', 'wine', 'brick', 'rust']);
  // Chimney
  c.rect(28, 1, 4, 7, 'slate');
  c.frame(28, 1, 4, 7, 'black');
  // Door and windows
  c.rect(17, 26, 6, 10, 'bark');
  c.frame(17, 26, 6, 10, 'black');
  c.set(21, 31, 'amber');
  windowAt(c, 8, 24);
  windowAt(c, 27, 24, true);
  return c;
}

function mine(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE * 2, CELL_SIZE * 2);
  // Shed with a dark metal roof
  c.rect(2, 14, 26, 22, 'ink');
  c.frame(2, 14, 26, 22, 'black');
  roof(c, 0, 4, 30, 12, ['black', 'night', 'slate', 'steel']);
  // Tunnel entrance with a timber frame
  c.rect(8, 22, 12, 14, 'black');
  c.rect(7, 21, 14, 2, 'bark');
  c.rect(7, 21, 2, 15, 'bark');
  c.rect(19, 21, 2, 15, 'bark');
  c.rect(10, 34, 8, 1, 'steel'); // rails coming out
  // Headframe tower
  c.rect(31, 2, 2, 22, 'bark');
  c.rect(37, 2, 2, 22, 'bark');
  for (let y = 4; y < 22; y += 6) c.rect(31, y, 8, 1, 'clay');
  c.disc(35, 3, 3, 'steel');
  c.disc(35, 3, 1.2, 'black');
  // Coal heap
  for (let y = 0; y < 9; y++) {
    const w = Math.min(10, 2 + y * 2);
    for (let x = 0; x < w; x++) {
      c.set(34 - w / 2 + x, 27 + y, (x + y) % 3 === 0 ? 'night' : 'black');
    }
  }
  return c;
}

function powerPlant(): PixelCanvas {
  const size = CELL_SIZE * 3;
  const c = new PixelCanvas(size, size);
  // Two striped chimneys behind the turbine hall
  for (const x of [46, 53]) {
    c.rect(x, 4, 6, 36, 'silver');
    for (let y = 4; y < 40; y += 10) c.rect(x, y, 6, 4, 'red');
    c.frame(x, 4, 6, 36, 'black');
    c.rect(x + 1, 4, 1, 36, 'white');
  }
  // Turbine hall
  c.rect(2, 30, 56, 28, 'steel');
  c.frame(2, 30, 56, 28, 'black');
  roof(c, 1, 24, 58, 8, ['black', 'slate', 'silver', 'white']);
  for (let x = 6; x < 54; x += 8) windowAt(c, x, 38, x % 16 === 6);
  c.rect(25, 48, 10, 10, 'ink');
  c.frame(25, 48, 10, 10, 'black');
  // Transformer yard
  c.rect(4, 6, 36, 14, 'slate');
  c.frame(4, 6, 36, 14, 'black');
  for (let x = 8; x < 38; x += 6) {
    c.rect(x, 9, 3, 8, 'ink');
    c.set(x + 1, 8, 'amber');
  }
  return c;
}

/** Frames `<object>_0`, at native size (1 cell = 20 px). */
export function objectFrames(): Map<string, PixelCanvas> {
  return new Map([
    ['tree_pine_0', pine()],
    ['tree_oak_0', oak()],
    ['cactus_0', cactus()],
    ['rock_0', rock()],
    ['house_s_0', house()],
    ['mine_0', mine()],
    ['power_plant_0', powerPlant()],
  ]);
}
