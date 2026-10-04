import type Phaser from 'phaser';
import { EXPLOSION_FRAMES, SMOKE_FRAMES } from '../../art/fx';
import { CELL_SIZE, TICK_SECONDS } from '../../core/constants';
import { cellCenter, type Cell } from '../../core/grid/coords';
import { trainPoses, type Facing } from '../../core/sim/facing';
import type { TrainState } from '../../core/sim/train';
import { terrainAt, type WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { AtlasLookup } from '../sprites';
import { vehicleTexture } from './EntityLayers';
import { DEPTH } from './staticLayers';

const SELECTED = 0xfeae34; // palette: amber
/** Fallback crash burst when the `ui` atlas is missing. */
const CRASH_COLOR = 0xf77622; // palette: orange
const CRASH_MS = 900;
const EXPLOSION_ANIM = 'fx:explosion';
const EXPLOSION_FPS = 10;
/** A running steam engine puffs this often (ms of real time) and each puff lives this long. */
const SMOKE_EVERY_MS = 260;
const SMOKE_LIFE_MS = 900;
/** Chimney position relative to the locomotive's center, facing north (pixels). */
const CHIMNEY_AHEAD = 6;

const AHEAD: Readonly<Record<Facing, { x: number; y: number }>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

/** Draws trains every frame, interpolating between simulation ticks for smooth motion. */
export class TrainLayer {
  private readonly images = new Map<string, Phaser.GameObjects.Image>();
  private readonly selection: Phaser.GameObjects.Graphics;
  /** Real time (ms) of each train's last puff. */
  private readonly lastPuff = new Map<string, number>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalogs: Catalogs,
    private readonly atlases: AtlasLookup,
  ) {
    this.selection = scene.add.graphics().setDepth(DEPTH.trains + 1);
    if (atlases.hasFrame('ui', 'explosion_0') && !scene.anims.exists(EXPLOSION_ANIM)) {
      scene.anims.create({
        key: EXPLOSION_ANIM,
        frames: Array.from({ length: EXPLOSION_FRAMES }, (_, i) => ({
          key: 'ui',
          frame: `explosion_${i}`,
        })),
        frameRate: EXPLOSION_FPS,
      });
    }
  }

  /** Plays the explosion where trains crashed (or a fading burst without the `ui` atlas). */
  crash(cell: Cell): void {
    const { x, y } = cellCenter(cell);
    if (this.scene.anims.exists(EXPLOSION_ANIM)) {
      const sprite = this.scene.add.sprite(x, y, 'ui', 'explosion_0').setDepth(DEPTH.trains + 2);
      sprite.play(EXPLOSION_ANIM);
      sprite.once('animationcomplete', () => {
        sprite.destroy();
      });
      return;
    }
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
   * @param animate false while the simulation is paused (no new smoke).
   */
  render(
    trains: readonly TrainState[],
    world: WorldState,
    alpha: number,
    selectedId: string | null,
    animate = alpha > 0,
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
        const texture = vehicleTexture(this.catalogs, this.atlases, models[i] ?? '', pose.facing);
        let image = this.images.get(key);
        if (!image) {
          image = this.scene.add.image(pose.x, pose.y, texture.key, texture.frame);
          image.setDepth(DEPTH.trains);
          this.images.set(key, image);
        }
        image.setPosition(pose.x, pose.y);
        const stale =
          image.texture.key !== texture.key ||
          (texture.frame !== undefined && image.frame.name !== texture.frame);
        if (stale) image.setTexture(texture.key, texture.frame);
        if (i === 0) {
          if (train.id === selectedId) {
            this.selection.lineStyle(2, SELECTED, 1);
            this.selection.strokeCircle(pose.x, pose.y, CELL_SIZE * 0.6);
          }
          if (animate && train.speed > 0) this.puff(train, pose.x, pose.y, pose.facing);
        }
      });
    }
    for (const [key, image] of this.images) {
      if (seen.has(key)) continue;
      image.destroy();
      this.images.delete(key);
    }
    for (const id of this.lastPuff.keys()) {
      if (!trains.some((t) => t.id === id)) this.lastPuff.delete(id);
    }
  }

  /** Steam engines leave a trail of puffs from the chimney that grow and fade. */
  private puff(train: TrainState, x: number, y: number, facing: Facing): void {
    if (!this.catalogs.locomotives[train.locomotive]?.render.smoke) return;
    if (!this.atlases.hasFrame('ui', 'smoke_0')) return;
    const now = this.scene.time.now;
    if (now - (this.lastPuff.get(train.id) ?? -Infinity) < SMOKE_EVERY_MS) return;
    this.lastPuff.set(train.id, now);
    const ahead = AHEAD[facing];
    const puff = this.scene.add
      .image(x + ahead.x * CHIMNEY_AHEAD, y + ahead.y * CHIMNEY_AHEAD, 'ui', 'smoke_0')
      .setDepth(DEPTH.trains + 1);
    let frame = 0;
    this.scene.tweens.add({
      targets: puff,
      y: puff.y - 8,
      alpha: 0,
      duration: SMOKE_LIFE_MS,
      onUpdate: (tween) => {
        const next = Math.min(SMOKE_FRAMES - 1, Math.floor(tween.progress * SMOKE_FRAMES));
        if (next !== frame) {
          frame = next;
          puff.setFrame(`smoke_${next}`);
        }
      },
      onComplete: () => {
        puff.destroy();
      },
    });
  }
}
