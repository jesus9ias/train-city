import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import type { WorldState } from '../../core/world/world';
import { logger } from '../../lib/logger';
import type { AtlasLookup } from '../sprites';
import { placeholderKeys } from '../textureFactory';

export const DEPTH = {
  terrain: 0,
  platforms: 1,
  grid: 2,
  tracks: 3,
  objects: 4,
  labels: 5,
  trains: 6,
  network: 8,
  ghost: 9,
} as const;

const GRID_COLOR = 0x000000;
const GRID_ALPHA = 0.12;

export const warnMissingSprite = (key: string, message: string) => {
  logger.devWarnOnce(key, message);
};

export function atlasLookup(textures: Phaser.Textures.TextureManager): AtlasLookup {
  return {
    hasAtlas: (atlas) => textures.exists(atlas),
    hasFrame: (atlas, frame) => textures.exists(atlas) && textures.get(atlas).has(frame),
  };
}

export function drawGrid(scene: Phaser.Scene, world: WorldState): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(DEPTH.grid);
  g.lineStyle(1, GRID_COLOR, GRID_ALPHA);
  for (let x = CELL_SIZE; x < world.widthPx; x += CELL_SIZE) g.lineBetween(x, 0, x, world.heightPx);
  for (let y = CELL_SIZE; y < world.heightPx; y += CELL_SIZE) g.lineBetween(0, y, world.widthPx, y);
  return g;
}

export function drawStations(scene: Phaser.Scene, world: WorldState): void {
  for (const station of world.stations) {
    const xs = station.cells.map((c) => c.x);
    const ys = station.cells.map((c) => c.y);
    const axis = new Set(xs).size === 1 ? 'vertical' : 'horizontal';
    for (const cell of station.cells) {
      scene.add
        .image(cell.x * CELL_SIZE, cell.y * CELL_SIZE, placeholderKeys.platform(axis))
        .setOrigin(0, 0)
        .setDepth(DEPTH.platforms);
    }
    const centerX = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CELL_SIZE;
    scene.add
      .text(centerX, Math.min(...ys) * CELL_SIZE - 2, station.name, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#1b1d24',
        strokeThickness: 3,
      })
      .setResolution(4)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.labels);
  }
}
