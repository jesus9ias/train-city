/**
 * Deterministic visual variant for a cell, so a map always looks the same without runtime RNG
 * (spec.md §4.14). Uses an integer hash of (x, y, salt).
 */
export function variantIndex(x: number, y: number, count: number, salt = 0): number {
  if (count <= 1) return 0;
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % count;
}

/** Small stable string hash, used to derive salts from ids. */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}
