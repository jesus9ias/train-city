import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZOOM_STEPS } from '../constants';
import { anchoredScroll, snapZoom, stepZoom } from './zoom';

describe('snapZoom', () => {
  it.each([
    [0.1, 0.5],
    [0.74, 0.5],
    [0.8, 1],
    [1.4, 1],
    [2.6, 3],
    [10, 4],
  ])('snaps %f to %f', (input, expected) => {
    expect(snapZoom(input)).toBe(expected);
  });
});

describe('stepZoom', () => {
  it('zooms in and out one step at a time', () => {
    expect(stepZoom(1, 1)).toBe(2);
    expect(stepZoom(2, -1)).toBe(1);
    expect(stepZoom(1, -1)).toBe(0.5);
  });

  it('clamps at both ends', () => {
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it('always returns an allowed step', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 10, noNaN: true }), fc.constantFrom(1, -1), (z, d) => {
        expect(ZOOM_STEPS).toContain(stepZoom(z, d));
      }),
    );
  });
});

describe('anchoredScroll', () => {
  const worldAt = (scroll: number, size: number, screen: number, zoom: number) =>
    scroll + size / 2 + (screen - size / 2) / zoom;

  it('keeps the world point under the anchor fixed', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -2000, max: 2000, noNaN: true }),
        fc.integer({ min: 100, max: 3000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom(...ZOOM_STEPS),
        fc.constantFrom(...ZOOM_STEPS),
        (scroll, size, anchorRatio, from, to) => {
          const anchor = anchorRatio * size;
          const next = anchoredScroll(scroll, size, anchor, from, to);
          expect(worldAt(next, size, anchor, to)).toBeCloseTo(
            worldAt(scroll, size, anchor, from),
            6,
          );
        },
      ),
    );
  });

  it('does not move when anchored at the viewport center', () => {
    expect(anchoredScroll(120, 800, 400, 1, 3)).toBe(120);
  });
});
