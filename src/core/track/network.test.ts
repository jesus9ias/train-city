import { describe, expect, it } from 'vitest';
import { makeLevel, testCatalogs } from '../../test/fixtures';
import { buildWorld } from '../world/world';
import { checkNetwork } from './network';

const at = (x: number, y: number) => ({ x, y });
const straightH = (x: number, y: number) => ({ at: at(x, y), piece: 'straight', rotation: 90 });
const platformH = (x: number, y: number) => ({
  at: at(x, y),
  piece: 'station_track',
  rotation: 90,
});

describe('checkNetwork', () => {
  it('reports loose ends and buffer stops', () => {
    const world = buildWorld(
      makeLevel({
        tracks: [
          { at: at(0, 0), piece: 'buffer', rotation: 270 }, // connects E
          straightH(1, 0),
          straightH(2, 0),
        ],
      }),
      testCatalogs,
    );
    const report = checkNetwork(world, testCatalogs.pieces);
    expect(report.looseEnds).toEqual([{ cell: at(2, 0), port: 'E' }]);
    expect(report.deadEnds).toEqual([at(0, 0)]);
    expect(report.groups).toBe(1);
    expect(report.isolatedStations).toEqual([]);
    expect(report.unusedTracks).toEqual([]);
  });

  it('finds isolated stations and unused track groups', () => {
    const world = buildWorld(
      makeLevel({
        tracks: [
          platformH(1, 1),
          straightH(2, 1),
          platformH(3, 1), // A and B connected
          platformH(10, 10), // C alone
          straightH(20, 20), // unused
        ],
        stations: [
          { id: 'A', name: 'A', cells: [at(1, 1)], dwellSeconds: 1 },
          { id: 'B', name: 'B', cells: [at(3, 1)], dwellSeconds: 1 },
          { id: 'C', name: 'C', cells: [at(10, 10)], dwellSeconds: 1 },
        ],
      }),
      testCatalogs,
    );
    const report = checkNetwork(world, testCatalogs.pieces);
    expect(report.groups).toBe(3);
    expect(report.isolatedStations).toEqual(['C']);
    expect(report.unusedTracks).toEqual([at(20, 20)]);
  });

  it('a closed loop has no loose ends', () => {
    const world = buildWorld(
      makeLevel({
        tracks: [
          { at: at(0, 0), piece: 'curve', rotation: 0 },
          { at: at(1, 0), piece: 'curve', rotation: 90 },
          { at: at(1, 1), piece: 'curve', rotation: 180 },
          { at: at(0, 1), piece: 'curve', rotation: 270 },
        ],
      }),
      testCatalogs,
    );
    expect(checkNetwork(world, testCatalogs.pieces)).toMatchObject({ looseEnds: [], groups: 1 });
  });
});
