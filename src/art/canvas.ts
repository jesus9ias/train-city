import { PALETTE, type PaletteColor } from './palette';

type Rgb = readonly [number, number, number];

function rgb(color: PaletteColor): Rgb {
  const v = Number.parseInt(PALETTE[color].slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

/**
 * A small RGBA bitmap that can only be painted with palette colors, so every sprite stays in
 * the palette by construction. Pure data: no DOM, usable from Node and from tests.
 */
export class PixelCanvas {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: PaletteColor | null): void {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
    const i = (py * this.width + px) * 4;
    if (color === null) {
      this.data.fill(0, i, i + 4);
      return;
    }
    const [r, g, b] = rgb(color);
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = 255;
  }

  /** `#rrggbb`, or null when the pixel is transparent. */
  get(x: number, y: number): string | null {
    const i = (y * this.width + x) * 4;
    if (!this.data[i + 3]) return null;
    const hex = (n: number | undefined) => (n ?? 0).toString(16).padStart(2, '0');
    return `#${hex(this.data[i])}${hex(this.data[i + 1])}${hex(this.data[i + 2])}`;
  }

  isOpaque(x: number, y: number): boolean {
    return (this.data[(y * this.width + x) * 4 + 3] ?? 0) > 0;
  }

  rect(x: number, y: number, w: number, h: number, color: PaletteColor): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color);
  }

  /** Rectangle outline. */
  frame(x: number, y: number, w: number, h: number, color: PaletteColor): void {
    for (let i = x; i < x + w; i++) {
      this.set(i, y, color);
      this.set(i, y + h - 1, color);
    }
    for (let j = y; j < y + h; j++) {
      this.set(x, j, color);
      this.set(x + w - 1, j, color);
    }
  }

  /** Filled disc centered on (cx, cy), sampled at pixel centers. */
  disc(cx: number, cy: number, r: number, color: PaletteColor): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) this.set(x, y, color);
      }
    }
  }

  /** Copies another canvas on top of this one (transparent pixels are skipped). */
  draw(source: PixelCanvas, ox: number, oy: number): void {
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        if (!source.isOpaque(x, y)) continue;
        const from = (y * source.width + x) * 4;
        const tx = ox + x;
        const ty = oy + y;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        this.data.set(source.data.subarray(from, from + 4), (ty * this.width + tx) * 4);
      }
    }
  }

  /** A copy turned clockwise by `quarterTurns` × 90° (lossless). */
  rotated(quarterTurns: number): PixelCanvas {
    const turns = ((quarterTurns % 4) + 4) % 4;
    const odd = turns % 2 === 1;
    const out = new PixelCanvas(odd ? this.height : this.width, odd ? this.width : this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const [tx, ty] =
          turns === 0
            ? [x, y]
            : turns === 1
              ? [this.height - 1 - y, x]
              : turns === 2
                ? [this.width - 1 - x, this.height - 1 - y]
                : [y, this.width - 1 - x];
        const from = (y * this.width + x) * 4;
        out.data.set(this.data.subarray(from, from + 4), (ty * out.width + tx) * 4);
      }
    }
    return out;
  }

  /**
   * A copy turned 45° clockwise, same size, by nearest-neighbor sampling about the center.
   * Not lossless (no 45° turn is), but it keeps every pixel a palette color.
   */
  rotated45(): PixelCanvas {
    const out = new PixelCanvas(this.width, this.height);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const k = Math.SQRT1_2;
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        // Undo a clockwise turn: rotate the destination pixel center counter-clockwise.
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const sx = Math.floor(cx + (dx + dy) * k);
        const sy = Math.floor(cy + (dy - dx) * k);
        if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) continue;
        const from = (sy * this.width + sx) * 4;
        if (!this.data[from + 3]) continue;
        out.data.set(this.data.subarray(from, from + 4), (y * out.width + x) * 4);
      }
    }
    return out;
  }
}
