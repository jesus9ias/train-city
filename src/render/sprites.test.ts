import { describe, expect, it, vi } from 'vitest';
import type { SpriteRef } from '../data/schemas/common';
import { hexToRgb, rgbToCss, rgbToNumber, shade } from './color';
import { resolvePrefixed, resolveSprite, spriteVariantCount, type AtlasLookup } from './sprites';

const atlases = (frames: Record<string, string[]>): AtlasLookup => ({
  hasAtlas: (atlas) => atlas in frames,
  hasFrame: (atlas, frame) => frames[atlas]?.includes(frame) ?? false,
});

const placeholder = { key: 'ph:object:rock' };

describe('Feature: Content extensible through JSON — sprites', () => {
  it('Scenario: Missing sprite frame falls back to a placeholder', () => {
    const onMissing = vi.fn();
    const result = resolveSprite(
      { atlas: 'objects', frames: ['rock_0'] },
      0,
      atlases({ objects: ['tree_pine_0'] }),
      placeholder,
      onMissing,
    );
    expect(result).toBe(placeholder);
    expect(onMissing).toHaveBeenCalledWith(
      'frame:objects:rock_0',
      'Frame "rock_0" not found in atlas "objects"; using a placeholder.',
    );
  });

  it('falls back when the whole atlas is missing', () => {
    const onMissing = vi.fn();
    const result = resolveSprite(
      { atlas: 'terrain', frames: ['grass_0'] },
      0,
      atlases({}),
      placeholder,
      onMissing,
    );
    expect(result).toBe(placeholder);
    expect(onMissing).toHaveBeenCalledWith(
      'atlas:terrain',
      expect.stringContaining('not available'),
    );
  });

  it('uses the placeholder silently when there is no sprite', () => {
    const onMissing = vi.fn();
    expect(resolveSprite(undefined, 0, atlases({}), placeholder, onMissing)).toBe(placeholder);
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('picks the frame for the variant', () => {
    const lookup = atlases({ terrain: ['grass_0', 'grass_1'] });
    const ref: SpriteRef = { atlas: 'terrain', frames: ['grass_0', 'grass_1'] };
    expect(resolveSprite(ref, 3, lookup, placeholder, vi.fn())).toEqual({
      key: 'terrain',
      frame: 'grass_1',
    });
    expect(spriteVariantCount(ref, lookup)).toBe(2);
    expect(spriteVariantCount(ref, atlases({}))).toBe(0);
    expect(spriteVariantCount(undefined, lookup)).toBe(0);
  });
});

describe('prefixed sprites (vehicle facings, switch states)', () => {
  const lookup = atlases({ vehicles: ['loco_steam_N', 'loco_steam_E'] });
  const ref: SpriteRef = { atlas: 'vehicles', prefix: 'loco_steam' };
  const fallback = { key: 'ph:vehicle:loco_steam:S' };

  it('resolves <prefix>_<suffix> frames', () => {
    expect(resolvePrefixed(ref, 'E', lookup, fallback, vi.fn())).toEqual({
      key: 'vehicles',
      frame: 'loco_steam_E',
    });
  });

  it('falls back when the frame is missing or there is no prefix', () => {
    const onMissing = vi.fn();
    expect(resolvePrefixed(ref, 'S', lookup, fallback, onMissing)).toBe(fallback);
    expect(onMissing).toHaveBeenCalledOnce();
    expect(resolvePrefixed(undefined, 'S', lookup, fallback, onMissing)).toBe(fallback);
    expect(resolvePrefixed({ atlas: 'vehicles' }, 'S', lookup, fallback, onMissing)).toBe(fallback);
  });
});

describe('color', () => {
  it('converts and shades colors', () => {
    const green = hexToRgb('#5DA130');
    expect(green).toEqual({ r: 0x5d, g: 0xa1, b: 0x30 });
    expect(rgbToNumber(green)).toBe(0x5da130);
    expect(rgbToCss(green)).toBe('rgb(93,161,48)');
    expect(shade(green, -1)).toEqual({ r: 0, g: 0, b: 0 });
    expect(shade(green, 1)).toEqual({ r: 255, g: 255, b: 255 });
    expect(shade(green, 0)).toEqual(green);
  });
});
