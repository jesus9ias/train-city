import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { variantIndex } from '../../core/grid/variant';
import { cellKey, type PlacedObject, type PlacedTrack } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import { resolveSprite, type AtlasLookup, type TextureRef } from '../sprites';
import { placeholderKeys, trackTexture } from '../textureFactory';
import { DEPTH, warnMissingSprite } from './staticLayers';

/**
 * Keeps one image per entity in sync with a list of immutable entities: unchanged entities
 * (same object identity) keep their image, the rest are recreated or removed.
 */
class SyncedImages<T> {
  private readonly images = new Map<string, { entity: T; image: Phaser.GameObjects.Image }>();
  private lastList: readonly T[] | null = null;

  constructor(
    private readonly keyOf: (entity: T) => string,
    private readonly create: (entity: T) => Phaser.GameObjects.Image | null,
  ) {}

  sync(list: readonly T[]): void {
    if (list === this.lastList) return;
    this.lastList = list;
    const seen = new Set<string>();
    for (const entity of list) {
      const key = this.keyOf(entity);
      seen.add(key);
      const existing = this.images.get(key);
      if (existing?.entity === entity) continue;
      existing?.image.destroy();
      const image = this.create(entity);
      if (image) this.images.set(key, { entity, image });
      else this.images.delete(key);
    }
    for (const [key, { image }] of this.images) {
      if (seen.has(key)) continue;
      image.destroy();
      this.images.delete(key);
    }
  }
}

export class TrackLayer {
  private readonly synced: SyncedImages<PlacedTrack>;

  constructor(scene: Phaser.Scene, catalogs: Catalogs) {
    this.synced = new SyncedImages(
      (track) => cellKey(track.at),
      (track) => {
        const piece = catalogs.pieces[track.piece];
        if (!piece) return null;
        return scene.add
          .image(
            track.at.x * CELL_SIZE,
            track.at.y * CELL_SIZE,
            trackTexture(scene, piece, track.rotation, track.state),
          )
          .setOrigin(0, 0)
          .setDepth(DEPTH.tracks);
      },
    );
  }

  sync(tracks: readonly PlacedTrack[]): void {
    this.synced.sync(tracks);
  }
}

export function objectTexture(
  catalogs: Catalogs,
  atlases: AtlasLookup,
  type: string,
  x: number,
  y: number,
): TextureRef | null {
  const def = catalogs.objects[type];
  if (!def) return null;
  return resolveSprite(
    def.sprite,
    variantIndex(x, y, def.sprite?.frames?.length ?? 1),
    atlases,
    { key: placeholderKeys.object(def.id) },
    warnMissingSprite,
  );
}

export class ObjectLayer {
  private readonly synced: SyncedImages<PlacedObject>;

  constructor(scene: Phaser.Scene, catalogs: Catalogs, atlases: AtlasLookup) {
    this.synced = new SyncedImages(
      (object) => object.id,
      (object) => {
        const texture = objectTexture(catalogs, atlases, object.type, object.at.x, object.at.y);
        if (!texture) return null;
        return scene.add
          .image(object.at.x * CELL_SIZE, object.at.y * CELL_SIZE, texture.key, texture.frame)
          .setOrigin(0, 0)
          .setDepth(DEPTH.objects);
      },
    );
  }

  sync(objects: readonly PlacedObject[]): void {
    this.synced.sync(objects);
  }
}
