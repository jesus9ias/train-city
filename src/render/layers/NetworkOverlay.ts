import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { portPoint } from '../../core/track/geometry';
import type { NetworkReport } from '../../core/track/network';
import type { WorldState } from '../../core/world/world';
import { DEPTH } from './staticLayers';

const LOOSE_END = 0xff9f1c;
const DEAD_END = 0xf85149;
const UNUSED = 0x58a6ff;
const ISOLATED = 0xd2a8ff;

/** Highlights problems found by the network check (spec.md §6.1). */
export class NetworkOverlay {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.network);
  }

  render(report: NetworkReport | null, world: WorldState): void {
    const { g } = this;
    g.clear();
    if (!report) return;

    g.lineStyle(2, UNUSED, 0.9);
    for (const cell of report.unusedTracks) {
      g.strokeRect(cell.x * CELL_SIZE + 1, cell.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
    g.lineStyle(2, ISOLATED, 1);
    for (const station of world.stations) {
      if (!report.isolatedStations.includes(station.id)) continue;
      for (const cell of station.cells) {
        g.strokeRect(cell.x * CELL_SIZE + 1, cell.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }
    g.lineStyle(2, DEAD_END, 1);
    for (const cell of report.deadEnds) {
      g.strokeCircle((cell.x + 0.5) * CELL_SIZE, (cell.y + 0.5) * CELL_SIZE, CELL_SIZE / 2 - 1);
    }
    g.fillStyle(LOOSE_END, 1);
    for (const { cell, port } of report.looseEnds) {
      const p = portPoint(port);
      const x = (cell.x + p.x) * CELL_SIZE;
      const y = (cell.y + p.y) * CELL_SIZE;
      g.fillRect(x - 3, y - 3, 6, 6);
    }
  }
}
