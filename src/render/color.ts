export type Rgb = { readonly r: number; readonly g: number; readonly b: number };

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function rgbToNumber({ r, g, b }: Rgb): number {
  return (r << 16) | (g << 8) | b;
}

export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r},${g},${b})`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a color; amount is in -1..1. */
export function shade({ r, g, b }: Rgb, amount: number): Rgb {
  const target = amount < 0 ? 0 : 255;
  const k = Math.min(Math.abs(amount), 1);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  return { r: mix(r), g: mix(g), b: mix(b) };
}
