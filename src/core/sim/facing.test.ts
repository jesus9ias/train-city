import { describe, expect, it } from 'vitest';
import { facingOf, poseIn, trainPoses } from './facing';
import type { TrainState } from './train';

describe('vehicle poses', () => {
  it('snaps directions to facings', () => {
    expect(facingOf(1, 0)).toBe('E');
    expect(facingOf(-1, 0.2)).toBe('W');
    expect(facingOf(0, 1)).toBe('S');
    expect(facingOf(0.1, -1)).toBe('N');
  });

  it('places a vehicle along its route', () => {
    const pass = { cell: { x: 2, y: 3 }, entry: 'S', exit: 'N' } as const;
    expect(poseIn(pass, 0.5)).toEqual({ x: 50, y: 70, facing: 'N' });
    expect(poseIn(pass, 2)).toEqual({ x: 50, y: 60, facing: 'N' }); // clamped
  });

  it('turns the facing along a curve', () => {
    const pass = { cell: { x: 0, y: 0 }, entry: 'S', exit: 'E' } as const;
    expect(poseIn(pass, 0.05).facing).toBe('N');
    expect(poseIn(pass, 0.95).facing).toBe('E');
  });

  it('poses the whole train, interpolating forward', () => {
    const train = {
      head: { cell: { x: 5, y: 5 }, entry: 'S', exit: 'N' },
      trail: [{ cell: { x: 5, y: 6 }, entry: 'S', exit: 'N' }],
      progress: 0.5,
    } as unknown as TrainState;
    expect(trainPoses(train).map((p) => p.y)).toEqual([110, 130]);
    expect(trainPoses(train, 0.25).map((p) => p.y)).toEqual([105, 125]);
    const dead = { ...train, head: { cell: { x: 5, y: 5 }, entry: 'S', exit: null } } as TrainState;
    expect(trainPoses(dead, 99)[0]?.y).toBe(110);
  });
});
