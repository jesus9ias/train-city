import type { SpriteRef } from '../data/schemas/common';

/** A texture key plus optional frame, ready to hand to Phaser. */
export type TextureRef = { readonly key: string; readonly frame?: string };

export type AtlasLookup = {
  hasAtlas(atlas: string): boolean;
  hasFrame(atlas: string, frame: string): boolean;
};

/** Number of visual variants a sprite offers once its atlas is loaded (1 when unknown). */
export function spriteVariantCount(ref: SpriteRef | undefined, atlases: AtlasLookup): number {
  if (!ref?.frames || !atlases.hasAtlas(ref.atlas)) return 0;
  return ref.frames.length;
}

/**
 * Resolves a catalog sprite to an atlas frame, falling back to a generated placeholder when the
 * atlas or frame is not available (spec.md §4.14). `onMissing` receives a stable key and a message
 * so callers can warn once per problem.
 */
export function resolveSprite(
  ref: SpriteRef | undefined,
  variant: number,
  atlases: AtlasLookup,
  placeholder: TextureRef,
  onMissing: (key: string, message: string) => void,
): TextureRef {
  if (!ref?.frames) return placeholder;
  if (!atlases.hasAtlas(ref.atlas)) {
    onMissing(`atlas:${ref.atlas}`, `Atlas "${ref.atlas}" is not available; using placeholders.`);
    return placeholder;
  }
  const frame = ref.frames[variant % ref.frames.length];
  if (frame === undefined || !atlases.hasFrame(ref.atlas, frame)) {
    onMissing(
      `frame:${ref.atlas}:${frame}`,
      `Frame "${frame}" not found in atlas "${ref.atlas}"; using a placeholder.`,
    );
    return placeholder;
  }
  return { key: ref.atlas, frame };
}
