import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { hashString, variantIndex } from '../../core/grid/variant';
import type { WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import { resolveSprite, spriteVariantCount, type AtlasLookup, type TextureRef } from '../sprites';
import { PLACEHOLDER_VARIANTS, placeholderKeys } from '../textureFactory';
import { DEPTH, warnMissingSprite } from './staticLayers';

const STAMP = { originX: 0, originY: 0 };

/** Terrain baked into one render texture; only changed cells are re-stamped (spec.md §12.3). */
export class TerrainLayer {
  private readonly rt: Phaser.GameObjects.RenderTexture;

  constructor(
    scene: Phaser.Scene,
    private readonly catalogs: Catalogs,
    private readonly atlases: AtlasLookup,
    world: WorldState,
  ) {
    this.rt = scene.add
      .renderTexture(0, 0, world.widthPx, world.heightPx)
      .setOrigin(0, 0)
      .setDepth(DEPTH.terrain);
    for (let y = 0; y < world.rows; y++) {
      for (let x = 0; x < world.cols; x++) this.stamp(world, x, y);
    }
    this.rt.render();
  }

  /** Re-stamps the cells whose terrain differs between two worlds. Returns how many changed. */
  update(previous: WorldState, next: WorldState): number {
    if (previous.terrain === next.terrain) return 0;
    let changed = 0;
    for (let i = 0; i < next.terrain.length; i++) {
      if (previous.terrain[i] === next.terrain[i]) continue;
      this.stamp(next, i % next.cols, Math.floor(i / next.cols));
      changed++;
    }
    if (changed) this.rt.render();
    return changed;
  }

  /** Texture for a terrain at a cell, also used by the ghost preview. */
  textureFor(terrainId: string, x: number, y: number): TextureRef | null {
    const def = this.catalogs.terrains[terrainId];
    if (!def) return null;
    const atlasVariants = spriteVariantCount(def.sprite, this.atlases);
    const variant = variantIndex(
      x,
      y,
      atlasVariants || PLACEHOLDER_VARIANTS,
      hashString(terrainId),
    );
    return resolveSprite(
      def.sprite,
      variant,
      this.atlases,
      { key: placeholderKeys.terrain(terrainId, variant % PLACEHOLDER_VARIANTS) },
      warnMissingSprite,
    );
  }

  private stamp(world: WorldState, x: number, y: number): void {
    const texture = this.textureFor(world.terrain[y * world.cols + x] ?? '', x, y);
    if (texture) this.rt.stamp(texture.key, texture.frame, x * CELL_SIZE, y * CELL_SIZE, STAMP);
  }
}
