import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import type { Cell } from '../../core/grid/coords';
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

/** Pixel font for map labels (loaded by the app; monospace until it arrives). */
export const LABEL_FONT = '"Pixelify Sans", monospace';

export function drawStations(scene: Phaser.Scene, world: WorldState, atlases: AtlasLookup): void {
  const hasPlatform = atlases.hasFrame('tracks', 'platform_0');
  const labels: Phaser.GameObjects.Text[] = [];
  for (const station of world.stations) {
    const xs = station.cells.map((c) => c.x);
    const ys = station.cells.map((c) => c.y);
    const axis = new Set(xs).size === 1 ? 'vertical' : 'horizontal';
    for (const cell of station.cells) {
      const image = hasPlatform
        ? scene.add
            .image((cell.x + 0.5) * CELL_SIZE, (cell.y + 0.5) * CELL_SIZE, 'tracks', 'platform_0')
            .setAngle(axis === 'vertical' ? 0 : 90)
        : scene.add
            .image(cell.x * CELL_SIZE, cell.y * CELL_SIZE, placeholderKeys.platform(axis))
            .setOrigin(0, 0);
      image.setDepth(DEPTH.platforms);
    }
    const centerX = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CELL_SIZE;
    labels.push(
      scene.add
        .text(centerX, Math.min(...ys) * CELL_SIZE - 2, station.name, {
          fontFamily: LABEL_FONT,
          fontSize: '10px',
          color: '#ffffff',
          stroke: '#181425',
          strokeThickness: 3,
        })
        .setResolution(4)
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.labels),
    );
  }
  // Canvas text is drawn once: redraw the labels when the pixel font finishes loading.
  if (labels.length && typeof document !== 'undefined' && 'fonts' in document) {
    void document.fonts.load(`10px ${LABEL_FONT}`).then(() => {
      for (const label of labels) if (label.active) label.updateText();
    });
  }
}

const FLASH_MS = 450;
const FLASH_COLOR = 0xfee761; // palette: yellow

/** Brief bracket around a cell, e.g. when a switch flips. */
export function flashCell(scene: Phaser.Scene, atlases: AtlasLookup, cell: Cell): void {
  const x = (cell.x + 0.5) * CELL_SIZE;
  const y = (cell.y + 0.5) * CELL_SIZE;
  const marker = atlases.hasFrame('ui', 'switch_marker')
    ? scene.add.image(x, y, 'ui', 'switch_marker')
    : scene.add.rectangle(x, y, CELL_SIZE, CELL_SIZE).setStrokeStyle(2, FLASH_COLOR);
  marker.setDepth(DEPTH.ghost);
  scene.tweens.add({
    targets: marker,
    scale: { from: 1.4, to: 1 },
    alpha: { from: 1, to: 0 },
    duration: FLASH_MS,
    ease: 'Quad.easeOut',
    onComplete: () => {
      marker.destroy();
    },
  });
}
