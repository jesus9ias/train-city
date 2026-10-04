import { describe, expect, it } from 'vitest';
import {
  distance,
  isTap,
  midpoint,
  PINCH_IN_RATIO,
  pinchStep,
  TAP_MAX_MOVE_PX,
  touchPans,
} from './gestures';

describe('Feature: Playing on a phone — gestures', () => {
  it('a touch that barely moves is a tap', () => {
    expect(isTap({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(true);
    expect(isTap({ x: 0, y: 0 }, { x: 6, y: 8 })).toBe(true); // exactly 10 px
    expect(isTap({ x: 0, y: 0 }, { x: TAP_MAX_MOVE_PX + 1, y: 0 })).toBe(false);
  });

  it('Scenario: Pinch to zoom — 100 px to 150 px apart is one step up', () => {
    expect(pinchStep(100, 150)).toBe(1);
    expect(pinchStep(100, 100 * PINCH_IN_RATIO)).toBe(1);
    expect(pinchStep(100, 120)).toBe(0);
    expect(pinchStep(150, 100)).toBe(-1);
    expect(pinchStep(0, 50)).toBe(0);
  });

  it('measures finger midpoint and distance', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('Scenario: One finger pans when no build tool is active', () => {
    expect(touchPans('editing', null)).toBe(true);
    expect(touchPans('editing', 'inspect')).toBe(true);
    expect(touchPans('editing', 'track')).toBe(false);
    expect(touchPans('editing', 'erase')).toBe(false);
    expect(touchPans('running', 'track')).toBe(true);
  });
});
