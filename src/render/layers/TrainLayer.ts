import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { trainPoses } from '../../core/sim/facing';
import { TICK_SECONDS } from '../../core/constants';
import type { TrainState } from '../../core/sim/train';
import { terrainAt, type WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import { placeholderKeys } from '../textureFactory';
import { DEPTH } from './staticLayers';

const SELECTED = 0xf2b544;

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
