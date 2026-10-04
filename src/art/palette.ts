/**
 * The game's fixed 32-color palette: ENDESGA 32 (ADR-002, docs/art.md). Every sprite pixel and
 * every catalog color must be one of these (or fully transparent).
 */
export const PALETTE = {
  brick: '#be4a2f',
  rust: '#d77643',
  sand: '#ead4aa',
  tan: '#e4a672',
  clay: '#b86f50',
  bark: '#733e39',
  plum: '#3e2731',
  wine: '#a22633',
  red: '#e43b44',
  orange: '#f77622',
  amber: '#feae34',
  yellow: '#fee761',
  lime: '#63c74d',
  green: '#3e8948',
  forest: '#265c42',
  pine: '#193c3e',
  navy: '#124e89',
  blue: '#0099db',
  cyan: '#2ce8f5',
  white: '#ffffff',
  silver: '#c0cbdc',
  steel: '#8b9bb4',
  slate: '#5a6988',
  ink: '#3a4466',
  night: '#262b44',
  black: '#181425',
  magenta: '#ff0044',
  violet: '#68386c',
  orchid: '#b55088',
  coral: '#f6757a',
  peach: '#e8b796',
  copper: '#c28569',
} as const;

export type PaletteColor = keyof typeof PALETTE;

const HEX_SET = new Set<string>(Object.values(PALETTE).map((hex) => hex.toLowerCase()));

/** True when a `#RRGGBB` color belongs to the palette (case-insensitive). */
export function inPalette(hex: string): boolean {
  return HEX_SET.has(hex.toLowerCase());
}
