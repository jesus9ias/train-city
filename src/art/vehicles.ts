import { CELL_SIZE } from '../core/constants';
import { PixelCanvas } from './canvas';
import type { PaletteColor } from './palette';

/** Facings with a frame each, in clockwise order from north (spec.md §4.14). */
export const VEHICLE_FACINGS = ['N', 'E', 'S', 'W'] as const;

/** Vehicle bodies span x = 5..14 (10 px) of the 20 px cell, centered on the track. */
const LEFT = 5;
const WIDTH = 10;

/** Paints vertical stripes across the body, one color per column (left to right). */
function columns(c: PixelCanvas, top: number, bottom: number, colors: readonly PaletteColor[]) {
  colors.forEach((color, i) => {
    c.rect(LEFT + i, top, 1, bottom - top + 1, color);
  });
}

function couplers(c: PixelCanvas, front: boolean) {
  if (front) c.rect(9, 0, 2, 2, 'ink');
  c.rect(9, CELL_SIZE - 2, 2, 2, 'ink');
}

function steam(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  couplers(c, false);
  c.rect(LEFT, 1, WIDTH, 1, 'red'); // buffer beam
  // Boiler: a cylinder lit from the left, with two dark bands.
  columns(c, 2, 11, [
    'black',
    'night',
    'ink',
    'slate',
    'ink',
    'night',
    'night',
    'night',
    'night',
    'black',
  ]);
  for (const y of [6, 10]) c.rect(LEFT + 1, y, WIDTH - 2, 1, 'black');
  c.disc(10, 3.5, 1.8, 'slate'); // smokestack
  c.disc(10, 3.5, 1, 'black');
  c.disc(10, 8, 1.3, 'amber'); // brass steam dome
  c.set(9, 7, 'yellow');
  c.set(7, 1, 'yellow'); // lamps
  c.set(12, 1, 'yellow');
  // Cab roof
  c.rect(4, 12, 12, 6, 'wine');
  c.rect(5, 13, 10, 1, 'brick');
  c.frame(4, 12, 12, 6, 'black');
  c.rect(6, 15, 8, 1, 'plum');
  return c;
}

function diesel(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  couplers(c, false);
  columns(c, 1, 18, [
    'black',
    'coral',
    'red',
    'red',
    'red',
    'red',
    'red',
    'brick',
    'brick',
    'black',
  ]);
  c.rect(LEFT, 1, WIDTH, 1, 'black');
  c.rect(LEFT, 18, WIDTH, 1, 'black');
  c.set(LEFT, 1, null); // rounded nose
  c.set(LEFT + WIDTH - 1, 1, null);
  c.rect(LEFT + 1, 2, WIDTH - 2, 1, 'yellow'); // warning stripe
  c.rect(LEFT + 1, 4, WIDTH - 2, 2, 'navy'); // windshield
  c.rect(LEFT + 2, 4, 2, 1, 'cyan');
  for (const y of [9, 14]) {
    c.disc(10, y + 0.5, 2.2, 'slate'); // roof fans
    c.rect(9, y, 2, 1, 'black');
  }
  c.set(7, 1, 'yellow'); // lamps
  c.set(12, 1, 'yellow');
  return c;
}

function wagonBody(c: PixelCanvas, colors: readonly PaletteColor[]) {
  couplers(c, true);
  columns(c, 2, 17, colors);
  c.rect(LEFT, 2, WIDTH, 1, 'black');
  c.rect(LEFT, 17, WIDTH, 1, 'black');
}

function passenger(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  wagonBody(c, [
    'black',
    'blue',
    'white',
    'silver',
    'silver',
    'silver',
    'steel',
    'steel',
    'navy',
    'black',
  ]);
  for (let y = 4; y < 16; y += 3) {
    c.set(LEFT + 1, y, 'cyan'); // side windows
    c.set(LEFT + WIDTH - 2, y, 'cyan');
  }
  c.rect(8, 6, 4, 1, 'slate'); // roof vents
  c.rect(8, 13, 4, 1, 'slate');
  return c;
}

function hopper(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  wagonBody(c, [
    'black',
    'copper',
    'plum',
    'plum',
    'plum',
    'plum',
    'plum',
    'plum',
    'bark',
    'black',
  ]);
  for (const y of [7, 12]) c.rect(LEFT + 1, y, WIDTH - 2, 1, 'bark'); // ribs
  c.rect(LEFT + 1, 3, WIDTH - 2, 1, 'copper');
  c.rect(LEFT + 1, 16, WIDTH - 2, 1, 'bark');
  return c;
}

function tank(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  wagonBody(c, ['black', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'ink', 'black']);
  // Rounded cylinder on the chassis.
  columns(c, 4, 15, [
    'black',
    'slate',
    'silver',
    'white',
    'silver',
    'steel',
    'steel',
    'slate',
    'ink',
    'black',
  ]);
  for (const x of [LEFT, LEFT + WIDTH - 1]) {
    c.set(x, 4, 'ink');
    c.set(x, 15, 'ink');
  }
  c.disc(10, 10, 1.6, 'steel'); // filler dome
  c.set(10, 10, 'black');
  return c;
}

function boxcar(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  wagonBody(c, [
    'black',
    'copper',
    'clay',
    'clay',
    'bark',
    'bark',
    'clay',
    'clay',
    'bark',
    'black',
  ]);
  for (let y = 5; y < 17; y += 3) c.rect(LEFT + 1, y, WIDTH - 2, 1, 'bark'); // roof planks
  return c;
}

const MODELS: Readonly<Record<string, () => PixelCanvas>> = {
  loco_steam: steam,
  loco_diesel: diesel,
  wagon_pax: passenger,
  wagon_hopper: hopper,
  wagon_tank: tank,
  wagon_box: boxcar,
};

/** Vehicle models that have authored art. */
export const VEHICLE_IDS = Object.keys(MODELS);

/** Frames `<model>_<facing>`, drawn nose-up and turned losslessly. */
export function vehicleFrames(): Map<string, PixelCanvas> {
  const frames = new Map<string, PixelCanvas>();
  for (const [id, draw] of Object.entries(MODELS)) {
    const north = draw();
    VEHICLE_FACINGS.forEach((facing, turns) => {
      frames.set(`${id}_${facing}`, north.rotated(turns));
    });
  }
  return frames;
}
