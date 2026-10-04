import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ZOOM_STEPS } from '../constants';
import { clampScroll } from './camera';

const visibleRange = (scroll: number, size: number, zoom: number) => {
  const center = scroll + size / 2;
  return { left: center - size / (2 * zoom), right: center + size / (2 * zoom) };
};

describe('clampScroll', () => {
  it('centers the map when it fits in the viewport', () => {
    // 1280px viewport at 1x over a 1000px map: the map center (500) is at the viewport center.
    const scroll = clampScroll(0, 1280, 1, 1000);
    expect(scroll + 1280 / 2).toBe(500);
  });

  it('centers at low zoom even when the map is bigger than the viewport in pixels', () => {
    const scroll = clampScroll(300, 800, 0.5, 1000); // 1600 world px visible
    expect(visibleRange(scroll, 800, 0.5)).toEqual({ left: -300, right: 1300 });
  });

  it('keeps scrolling inside the map when zoomed in', () => {
    expect(visibleRange(clampScroll(-5000, 800, 2, 1000), 800, 2).left).toBe(0);
    expect(visibleRange(clampScroll(5000, 800, 2, 1000), 800, 2).right).toBe(1000);
  });

  it('leaves valid scroll values untouched', () => {
    expect(clampScroll(100, 800, 2, 1000)).toBe(100);
  });

  it('allows a margin past the edges', () => {
    expect(visibleRange(clampScroll(-5000, 800, 2, 1000, 40), 800, 2).left).toBe(-40);
  });

  it('never shows more than the margin past an edge unless the map is centered', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.integer({ min: 200, max: 3000 }),
        fc.constantFrom(...ZOOM_STEPS),
        fc.integer({ min: 200, max: 4000 }),
        fc.integer({ min: 0, max: 100 }),
        (scroll, size, zoom, world, margin) => {
          const { left, right } = visibleRange(
            clampScroll(scroll, size, zoom, world, margin),
            size,
            zoom,
          );
          const fits = size / zoom >= world + margin * 2;
          if (fits) {
            expect((left + right) / 2).toBeCloseTo(world / 2, 6);
          } else {
            expect(left).toBeGreaterThanOrEqual(-margin - 1e-6);
            expect(right).toBeLessThanOrEqual(world + margin + 1e-6);
          }
        },
      ),
    );
  });
});
