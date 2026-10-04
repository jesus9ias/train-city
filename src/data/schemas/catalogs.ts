import { z } from 'zod';
import { colorSchema, idSchema, portSchema, renderHintSchema, spriteRefSchema } from './common';

const nameSchema = z.string().min(1);
const nonNegative = z.number().min(0);
const positive = z.number().positive();

export const terrainSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  color: colorSchema,
  sprite: spriteRefSchema.optional(),
  buildable: z.boolean(),
  trackCostMultiplier: nonNegative,
  fuelMultiplier: positive,
  speedMultiplier: positive,
});

export const objectSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  category: z.enum(['nature', 'building']),
  footprint: z.strictObject({ w: z.int().min(1).max(8), h: z.int().min(1).max(8) }),
  blocksTrack: z.boolean(),
  removable: z.boolean(),
  removeCost: nonNegative.optional(),
  render: renderHintSchema,
  sprite: spriteRefSchema.optional(),
  allowedTerrains: z.array(idSchema).min(1).optional(),
});

export const routeSchema = z.tuple([portSchema, portSchema.nullable()]);

export const trackPieceSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  cost: nonNegative,
  routes: z.array(routeSchema).min(1),
  stateful: z.boolean().optional(),
  trunk: portSchema.optional(),
  defaultState: z.int().min(0).optional(),
  isStation: z.boolean().optional(),
  sprite: spriteRefSchema.optional(),
});

export const locomotiveSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  maxSpeed: positive,
  acceleration: positive,
  fuelCapacity: positive,
  fuelPerUnit: nonNegative,
  fuelIdlePerSecond: nonNegative,
  weight: positive,
  maxWagons: z.int().min(0),
  cost: nonNegative,
  render: renderHintSchema.omit({ shape: true }),
  sprite: spriteRefSchema.optional(),
});

export const wagonSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  accepts: z.array(idSchema).min(1),
  capacity: positive,
  emptyWeight: positive,
  cost: nonNegative,
  render: renderHintSchema.omit({ shape: true }),
  sprite: spriteRefSchema.optional(),
});

export const cargoTypeSchema = z.strictObject({
  id: idSchema,
  name: nameSchema,
  unit: z.string().min(1),
  weightPerUnit: nonNegative,
  payPerUnit: nonNegative,
});

const version = z.literal(1);

export const terrainsFileSchema = z.strictObject({
  schemaVersion: version,
  terrains: z.array(terrainSchema).min(1),
});
export const objectsFileSchema = z.strictObject({
  schemaVersion: version,
  objects: z.array(objectSchema),
});
export const trackPiecesFileSchema = z.strictObject({
  schemaVersion: version,
  pieces: z.array(trackPieceSchema),
});
export const cargoTypesFileSchema = z.strictObject({
  schemaVersion: version,
  cargoTypes: z.array(cargoTypeSchema),
});
export const trainModelsFileSchema = z.strictObject({
  schemaVersion: z.literal(1),
  locomotives: z.array(locomotiveSchema),
  wagons: z.array(wagonSchema),
});

export const atlasManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  /** Atlas families that exist in public/assets/atlases as <name>.png + <name>.json. */
  atlases: z.array(spriteRefSchema.shape.atlas),
});

export type TerrainDef = z.infer<typeof terrainSchema>;
export type ObjectDef = z.infer<typeof objectSchema>;
export type Route = z.infer<typeof routeSchema>;
export type TrackPieceDef = z.infer<typeof trackPieceSchema>;
export type LocomotiveDef = z.infer<typeof locomotiveSchema>;
export type WagonDef = z.infer<typeof wagonSchema>;
export type CargoTypeDef = z.infer<typeof cargoTypeSchema>;
export type AtlasManifest = z.infer<typeof atlasManifestSchema>;

/** All catalogs, indexed by id for lookups. */
export type Catalogs = {
  terrains: Readonly<Record<string, TerrainDef>>;
  objects: Readonly<Record<string, ObjectDef>>;
  pieces: Readonly<Record<string, TrackPieceDef>>;
  locomotives: Readonly<Record<string, LocomotiveDef>>;
  wagons: Readonly<Record<string, WagonDef>>;
  cargoTypes: Readonly<Record<string, CargoTypeDef>>;
};
