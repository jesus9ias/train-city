import type { ATLAS_FAMILIES } from '../data/schemas/common';
import type { TrackPieceDef } from '../data/schemas/catalogs';
import { packAtlas, type PackedAtlas } from './atlas';
import { fxFrames } from './fx';
import { objectFrames } from './objects';
import { terrainFrames } from './terrain';
import { trackFrames } from './tracks';
import { vehicleFrames } from './vehicles';

export type AtlasFamily = (typeof ATLAS_FAMILIES)[number];

/**
 * Every atlas family of the game, generated from the sprite code in src/art (ADR-002).
 * Deterministic: the same code always produces the same pixels.
 */
export function buildAtlases(pieces: readonly TrackPieceDef[]): Map<AtlasFamily, PackedAtlas> {
  return new Map<AtlasFamily, PackedAtlas>([
    ['terrain', packAtlas('terrain', terrainFrames())],
    ['objects', packAtlas('objects', objectFrames())],
    ['tracks', packAtlas('tracks', trackFrames(pieces))],
    ['vehicles', packAtlas('vehicles', vehicleFrames())],
    ['ui', packAtlas('ui', fxFrames())],
  ]);
}
