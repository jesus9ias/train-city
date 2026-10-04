import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { variantIndex } from '../../core/grid/variant';
import type { Cell } from '../../core/grid/coords';
import type { Facing } from '../../core/sim/facing';
import { cellKey, type PlacedObject, type PlacedTrack } from '../../core/world/world';
import type { Catalogs, TrackPieceDef } from '../../data/schemas/catalogs';
import { resolvePrefixed, resolveSprite, type AtlasLookup, type TextureRef } from '../sprites';
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

/** A texture plus the rotation to draw it with (atlas frames are authored unrotated). */
export type PlacedTexture = TextureRef & { readonly angle: number };

/** Atlas frame `<piece>_<state>` turned by the track's rotation, or a pre-rotated placeholder. */
export function trackSprite(
  scene: Phaser.Scene,
  piece: TrackPieceDef,
  atlases: AtlasLookup,
  rotation: number,
  state: number,
): PlacedTexture {
  const placeholder = { key: placeholderKeys.track(piece.id, rotation, state) };
  const texture = resolvePrefixed(
    piece.sprite,
    String(state),
    atlases,
    placeholder,
    warnMissingSprite,
  );
  if (texture !== placeholder) return { ...texture, angle: rotation };
  return { key: trackTexture(scene, piece, rotation, state), angle: 0 };
}

/** Vehicle frame `<model>_<facing>`, or its placeholder. */
export function vehicleTexture(
  catalogs: Catalogs,
  atlases: AtlasLookup,
  model: string,
  facing: Facing,
): TextureRef {
  const def = catalogs.locomotives[model] ?? catalogs.wagons[model];
  return resolvePrefixed(
    def?.sprite,
    facing,
    atlases,
    { key: placeholderKeys.vehicle(model, facing) },
    warnMissingSprite,
  );
}

/** Draws a one-cell texture centered on its cell, rotated as needed. */
export function placeInCell(image: Phaser.GameObjects.Image, cell: Cell, texture: PlacedTexture) {
  return image
    .setTexture(texture.key, texture.frame)
    .setOrigin(0.5, 0.5)
    .setPosition((cell.x + 0.5) * CELL_SIZE, (cell.y + 0.5) * CELL_SIZE)
    .setAngle(texture.angle);
}

export class TrackLayer {
  private readonly synced: SyncedImages<PlacedTrack>;

  /** @param onSwitch called when a switch on the map changes state (flip feedback). */
  constructor(
    scene: Phaser.Scene,
    catalogs: Catalogs,
    atlases: AtlasLookup,
    private readonly onSwitch: (cell: Cell) => void = () => undefined,
  ) {
    const states = new Map<string, number>();
    this.synced = new SyncedImages(
      (track) => cellKey(track.at),
      (track) => {
        const piece = catalogs.pieces[track.piece];
        if (!piece) return null;
        const key = cellKey(track.at);
        const previous = states.get(key);
        states.set(key, track.state);
        if (piece.stateful && previous !== undefined && previous !== track.state) {
          this.onSwitch(track.at);
        }
        const texture = trackSprite(scene, piece, atlases, track.rotation, track.state);
        return placeInCell(scene.add.image(0, 0, texture.key), track.at, texture).setDepth(
          DEPTH.tracks,
        );
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
