import { z } from 'zod';
import { PORTS } from '../../core/grid/ports';

export const idSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'ids use letters, digits, "_" and "-"');

export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'colors use the #RRGGBB format');

export const cellSchema = z.strictObject({
  x: z.int().min(0),
  y: z.int().min(0),
});

export const portSchema = z.enum(PORTS);

/** Atlas families shipped in public/assets/atlases (spec.md §4.14). */
export const ATLAS_FAMILIES = ['terrain', 'objects', 'tracks', 'vehicles', 'ui'] as const;

export const spriteRefSchema = z.strictObject({
  atlas: z.enum(ATLAS_FAMILIES),
  /** Explicit frame names; several frames are visual variants. */
  frames: z.array(z.string().min(1)).min(1).optional(),
  /** Frame name prefix, for sprites with one frame per facing (`<prefix>_<facing>`). */
  prefix: z.string().min(1).optional(),
});

export const renderHintSchema = z.strictObject({
  shape: z.enum(['rect', 'circle']).default('rect'),
  color: colorSchema,
});

export type SpriteRef = z.infer<typeof spriteRefSchema>;
export type RenderHint = z.infer<typeof renderHintSchema>;
