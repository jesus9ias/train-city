import { z } from 'zod';
import { cellSchema, idSchema, portSchema } from './common';
import { stationSchema } from './level';

export const SAVE_FORMAT = 'traincity-save';
export const CURRENT_SAVE_VERSION = 3;

/** Fields every save version has; checked before migrating. */
export const saveHeaderSchema = z.looseObject({
  format: z.literal(SAVE_FORMAT, { error: 'Not a Train City save file' }),
  schemaVersion: z.int().min(1),
});

const amount = z.number().min(0);

const ledgerSchema = z.strictObject({
  build: amount,
  objects: amount,
  trains: amount,
  fuel: amount,
  revenue: amount,
  refunds: amount,
});

const cellPassSchema = z.strictObject({
  cell: cellSchema,
  entry: portSchema,
  exit: portSchema.nullable(),
});

const trainSchema = z.strictObject({
  id: z.string().min(1),
  locomotive: idSchema,
  wagons: z.array(z.strictObject({ model: idSchema, cargo: idSchema.nullable(), amount })),
  head: cellPassSchema,
  progress: amount,
  trail: z.array(cellPassSchema),
  speed: amount,
  running: z.boolean(),
  status: z.enum(['stopped', 'running', 'loading', 'blocked', 'derailed', 'out_of_fuel']),
  fuel: amount,
  autoRefuel: z.boolean(),
  purchaseValue: amount,
  paid: amount,
  placedInSession: z.int().min(1),
  dwellRemaining: amount,
  lastStation: idSchema.nullable(),
});

const cargoAmountsSchema = z.record(idSchema, amount);

const outcomeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('completed'),
    stars: z.int().min(0).max(3),
    score: z.number(),
    seconds: amount,
    fuelUsed: amount,
    buildCost: z.number(),
  }),
  z.strictObject({ kind: z.literal('failed'), reason: z.string() }),
]);

/**
 * Save format v3 (spec.md §7.2): v1 world + v2 trains and clock + v3 cargo, fuel metrics and
 * outcome. Also the download format.
 */
export const saveSchema = z.strictObject({
  format: z.literal(SAVE_FORMAT),
  schemaVersion: z.literal(3),
  gameVersion: z.string(),
  savedAt: z.iso.datetime(),
  levelId: idSchema,
  /** Hash of the level definition the save was made with. */
  levelHash: z.string(),
  mode: z.enum(['editing', 'running']),
  world: z.strictObject({
    widthPx: z.int(),
    heightPx: z.int(),
    /** Row-major terrain as run-length pairs: [terrainId, count]. */
    terrain: z.array(z.tuple([idSchema, z.int().positive()])),
    objects: z.array(
      z.strictObject({
        id: z.string().min(1),
        type: idSchema,
        at: cellSchema,
        locked: z.boolean(),
        placedInSession: z.int().min(1).nullable(),
      }),
    ),
    tracks: z.array(
      z.strictObject({
        at: cellSchema,
        piece: idSchema,
        rotation: z.int(),
        state: z.int().min(0),
        locked: z.boolean(),
        paid: amount,
        placedInSession: z.int().min(1).nullable(),
      }),
    ),
    stations: z.array(stationSchema),
    trains: z.array(trainSchema),
  }),
  run: z.strictObject({
    elapsedTicks: z.int().min(0),
    paused: z.boolean(),
    inventories: z.record(idSchema, cargoAmountsSchema),
    delivered: z.record(idSchema, cargoAmountsSchema),
    lost: cargoAmountsSchema,
    fuelUsedTotal: amount,
    fuelUsedByTrain: z.record(z.string(), amount),
    fuelBoughtTotal: amount,
    outcome: outcomeSchema.nullable(),
  }),
  economy: z.strictObject({
    initialMoney: amount.nullable(),
    ledger: ledgerSchema,
  }),
  editor: z.strictObject({
    session: z.int().min(1),
    nextObjectId: z.int().min(1),
    nextTrainId: z.int().min(1),
  }),
});

export type SaveGame = z.infer<typeof saveSchema>;
