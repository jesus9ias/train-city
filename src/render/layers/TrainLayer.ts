import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { cellCenter, type Cell } from '../../core/grid/coords';
import { trainPoses } from '../../core/sim/facing';
import { TICK_SECONDS } from '../../core/constants';
import type { TrainState } from '../../core/sim/train';
import { terrainAt, type WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import { placeholderKeys } from '../textureFactory';
import { DEPTH } from './staticLayers';

const SELECTED = 0xf2b544;
/** Placeholder crash burst until the pixel-art pass (Stage 7). */
const CRASH_COLOR = 0xff6a00;
const CRASH_MS = 900;

/** Draws trains every frame, interpolating between simulation ticks for smooth motion. */
export class TrainLayer {
  private readonly images = new Map<string, Phaser.GameObjects.Image>();
  private readonly selection: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalogs: Catalogs,
  ) {
    this.selection = scene.add.graphics().setDepth(DEPTH.trains + 1);
  }

  /** Flashes an expanding, fading burst where trains crashed. */
  crash(cell: Cell): void {
    const { x, y } = cellCenter(cell);
    const burst = this.scene.add
      .circle(x, y, CELL_SIZE * 0.6, CRASH_COLOR, 0.9)
      .setDepth(DEPTH.trains + 2);
    this.scene.tweens.add({
      targets: burst,
      scale: 2.5,
      alpha: 0,
      duration: CRASH_MS,
      onComplete: () => {
        burst.destroy();
      },
    });
  }

  /**
   * @param alpha fraction (0..1) of the next tick already elapsed; 0 when paused.
   */
  render(
    trains: readonly TrainState[],
    world: WorldState,
    alpha: number,
    selectedId: string | null,
  ): void {
    const seen = new Set<string>();
    this.selection.clear();
    for (const train of trains) {
      const terrain = this.catalogs.terrains[terrainAt(world, train.head.cell) ?? ''];
      const extra = train.speed * (terrain?.speedMultiplier ?? 1) * TICK_SECONDS * alpha;
      const models = [train.locomotive, ...train.wagons.map((w) => w.model)];
      trainPoses(train, extra).forEach((pose, i) => {
        const key = `${train.id}:${i}`;
        seen.add(key);
        const texture = placeholderKeys.vehicle(models[i] ?? '', pose.facing);
        let image = this.images.get(key);
        if (!image) {
          image = this.scene.add.image(pose.x, pose.y, texture).setDepth(DEPTH.trains);
          this.images.set(key, image);
        }
        image.setPosition(pose.x, pose.y);
        if (image.texture.key !== texture) image.setTexture(texture);
        if (i === 0 && train.id === selectedId) {
          this.selection.lineStyle(2, SELECTED, 1);
          this.selection.strokeCircle(pose.x, pose.y, CELL_SIZE * 0.6);
        }
      });
    }
    for (const [key, image] of this.images) {
      if (seen.has(key)) continue;
      image.destroy();
      this.images.delete(key);
    }
  }
}
