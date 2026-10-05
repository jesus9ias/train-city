import { CELL_SIZE } from '../core/constants';
import { PixelCanvas } from './canvas';
import type { PaletteColor } from './palette';

/** Frames of the crash explosion animation. */
export const EXPLOSION_FRAMES = 6;
/** Frames of a steam puff, from fresh to dissipating. */
export const SMOKE_FRAMES = 4;

const EXPLOSION_SIZE = CELL_SIZE * 2;

/** Rings of a fireball, outside in. */
const FIRE: readonly PaletteColor[][] = [
  ['amber', 'yellow', 'white'],
  ['orange', 'amber', 'yellow', 'white'],
  ['red', 'orange', 'amber', 'yellow'],
  ['wine', 'red', 'orange', 'amber'],
  ['night', 'slate', 'wine', 'red'],
  ['night', 'slate', 'steel'],
];

/** A ragged disc: the radius wobbles with the angle so the blast looks irregular. */
function blast(c: PixelCanvas, radius: number, rings: readonly PaletteColor[], seed: number) {
  const center = c.width / 2;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      const angle = Math.atan2(dy, dx);
      const wobble = 1 + 0.18 * Math.sin(angle * 5 + seed) + 0.1 * Math.sin(angle * 9 - seed);
      const d = Math.hypot(dx, dy) / (radius * wobble);
      if (d > 1) continue;
      const ring = Math.min(rings.length - 1, Math.floor((1 - d) * rings.length));
      const color = rings[ring];
      if (color) c.set(x, y, color);
    }
  }
}

function explosion(frame: number): PixelCanvas {
  const c = new PixelCanvas(EXPLOSION_SIZE, EXPLOSION_SIZE);
  const radius = [5, 9, 13, 16, 18, 19][frame] ?? 19;
  blast(c, radius, FIRE[frame] ?? [], frame * 1.7);
  if (frame >= 2) {
    // Flying debris.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + frame;
      const r = radius + 1;
      const center = EXPLOSION_SIZE / 2;
      c.set(center + Math.cos(angle) * r, center + Math.sin(angle) * r, i % 2 ? 'black' : 'orange');
    }
  }
  return c;
}

function smoke(frame: number): PixelCanvas {
  const size = 12;
  const c = new PixelCanvas(size, size);
  const r = 2.5 + frame * 1.1;
  const [outline, base, light] = (
    [
      ['steel', 'silver', 'white'],
      ['steel', 'silver', 'white'],
      ['slate', 'steel', 'silver'],
      ['ink', 'slate', 'steel'],
    ] as const
  )[frame] ?? ['ink', 'slate', 'steel'];
  c.disc(size / 2, size / 2, r, outline);
  c.disc(size / 2, size / 2, r - 1, base);
  c.disc(size / 2 - r / 3, size / 2 - r / 3, Math.max(1, r / 2.5), light);
  return c;
}

/** A bracket around a cell, shown when a switch flips. */
function switchMarker(): PixelCanvas {
  const c = new PixelCanvas(CELL_SIZE, CELL_SIZE);
  const corner = (x: number, y: number, dx: number, dy: number) => {
    for (let i = 0; i < 5; i++) {
      c.set(x + dx * i, y, 'yellow');
      c.set(x, y + dy * i, 'yellow');
    }
  };
  corner(0, 0, 1, 1);
  corner(CELL_SIZE - 1, 0, -1, 1);
  corner(0, CELL_SIZE - 1, 1, -1);
  corner(CELL_SIZE - 1, CELL_SIZE - 1, -1, -1);
  return c;
}

/** A lit signal lamp (3 × 3, drawn over the post's dark lamp). */
function signalLamp(dark: 'wine' | 'green', lit: 'red' | 'lime'): PixelCanvas {
  const c = new PixelCanvas(3, 3);
  c.rect(0, 0, 3, 3, dark);
  for (const [x, y] of [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2],
  ] as const)
    c.set(x, y, lit);
  return c;
}

/**
 * Effect frames of the `ui` atlas: `explosion_<n>`, `smoke_<n>`, `switch_marker`, and the signal
 * lamps `signal_red` / `signal_green`.
 */
export function fxFrames(): Map<string, PixelCanvas> {
  const frames = new Map<string, PixelCanvas>();
  for (let i = 0; i < EXPLOSION_FRAMES; i++) frames.set(`explosion_${i}`, explosion(i));
  for (let i = 0; i < SMOKE_FRAMES; i++) frames.set(`smoke_${i}`, smoke(i));
  frames.set('switch_marker', switchMarker());
  frames.set('signal_red', signalLamp('wine', 'red'));
  frames.set('signal_green', signalLamp('green', 'lime'));
  return frames;
}
