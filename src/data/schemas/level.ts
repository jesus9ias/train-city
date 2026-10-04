import { z } from 'zod';
import { cellSchema, idSchema } from './common';

const rectSchema = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
  w: z.int().min(1),
  h: z.int().min(1),
});

export const placedObjectSchema = z.strictObject({
  type: idSchema,
  at: cellSchema,
  locked: z.boolean().optional(),
});

export const placedTrackSchema = z.strictObject({
  at: cellSchema,
  piece: idSchema,
  rotation: z.int(),
  state: z.int().min(0).optional(),
  locked: z.boolean().optional(),
});

export const stationSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  cells: z.array(cellSchema).min(1),
  supplies: z
    .array(
      z.strictObject({
        cargo: idSchema,
        ratePerMinute: z.number().min(0),
        capacity: z.number().positive(),
        initial: z.number().min(0),
      }),
    )
    .default([]),
  demands: z.array(z.strictObject({ cargo: idSchema })).default([]),
  services: z.array(z.enum(['fuel'])).default([]),
  dwellSeconds: z.number().min(0),
  locked: z.boolean().optional(),
});

const idList = z.array(idSchema);

export const levelSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: idSchema,
  name: z.string().min(1),
  description: z.string().default(''),
  map: z.strictObject({
    widthPx: z.int(),
    heightPx: z.int(),
    defaultTerrain: idSchema,
    terrainPatches: z.array(z.strictObject({ terrain: idSchema, rect: rectSchema })).default([]),
    objects: z.array(placedObjectSchema).default([]),
    tracks: z.array(placedTrackSchema).default([]),
    stations: z.array(stationSchema).default([]),
  }),
  /** Omitted lists mean "everything in the catalog is allowed". */
  editorRules: z.strictObject({
    allowTerrainEdit: z.boolean(),
    allowObjectEdit: z.boolean(),
    allowedPieces: idList.optional(),
    allowedLocomotives: idList.optional(),
    allowedWagons: idList.optional(),
    maxTrains: z.int().min(1).nullable(),
  }),
  economy: z.strictObject({
    /** null = unlimited money (sandbox). */
    initialMoney: z.number().min(0).nullable(),
    fuelPrice: z.number().min(0),
    refundRatio: z.number().min(0).max(1).default(0.5),
    payOverrides: z.record(idSchema, z.number().min(0)).default({}),
  }),
  objectives: z
    .array(
      z.strictObject({
        id: idSchema,
        type: z.literal('deliver'),
        cargo: idSchema,
        amount: z.number().positive(),
        to: idSchema,
        from: idSchema.optional(),
      }),
    )
    .default([]),
  constraints: z.strictObject({ timeLimitSeconds: z.number().positive().optional() }).default({}),
  scoring: z
    .strictObject({
      stars: z.array(
        z.strictObject({
          stars: z.int().min(1).max(3),
          maxSeconds: z.number().positive().optional(),
          maxFuel: z.number().positive().optional(),
          maxBuildCost: z.number().positive().optional(),
        }),
      ),
    })
    .default({ stars: [] }),
  seed: z.int(),
});

export const levelIndexSchema = z.strictObject({
  schemaVersion: z.literal(1),
  levels: z
    .array(z.strictObject({ id: idSchema, name: z.string().min(1), unlocked: z.boolean() }))
    .min(1),
});

export type Level = z.infer<typeof levelSchema>;
export type LevelInput = z.input<typeof levelSchema>;
export type PlacedObjectDef = z.infer<typeof placedObjectSchema>;
export type PlacedTrackDef = z.infer<typeof placedTrackSchema>;
export type StationDef = z.infer<typeof stationSchema>;
export type LevelIndex = z.infer<typeof levelIndexSchema>;
export type LevelIndexEntry = LevelIndex['levels'][number];
