import { describe, expect, it } from 'vitest';
import { hashString, variantIndex } from './variant';

describe('variantIndex', () => {
  it('is stable for the same cell', () => {
    expect(variantIndex(12, 34, 3)).toBe(variantIndex(12, 34, 3));
  });

  it('always returns 0 for a single variant', () => {
    expect(variantIndex(5, 5, 1)).toBe(0);
    expect(variantIndex(5, 5, 0)).toBe(0);
  });

  it('uses every variant across a map, roughly evenly', () => {
    const counts = [0, 0, 0];
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const v = variantIndex(x, y, 3);
        counts[v] = (counts[v] ?? 0) + 1;
      }
    }
    for (const count of counts) expect(count).toBeGreaterThan(2500 / 3 - 150);
  });

  it('changes with the salt', () => {
    const a = Array.from({ length: 20 }, (_, i) => variantIndex(i, 0, 4, 1));
    const b = Array.from({ length: 20 }, (_, i) => variantIndex(i, 0, 4, 2));
    expect(a).not.toEqual(b);
  });
});

describe('hashString', () => {
  it('is stable and distinguishes ids', () => {
    expect(hashString('grass')).toBe(hashString('grass'));
    expect(hashString('grass')).not.toBe(hashString('snow'));
  });
});
