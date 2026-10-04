import { loadAtlasManifest } from '../data/loader';

export type FrameRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** Frame table of one atlas family, as written by the art generator. */
export type AtlasFrames = {
  readonly url: string;
  readonly size: { readonly w: number; readonly h: number };
  readonly frames: ReadonlyMap<string, FrameRect>;
};

const cache = new Map<string, Promise<AtlasFrames | null>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validates the parts of a Phaser JSON-hash atlas the UI needs (it is external data). */
function parseAtlas(url: string, json: unknown): AtlasFrames | null {
  if (!isRecord(json) || !isRecord(json['frames']) || !isRecord(json['meta'])) return null;
  const size = json['meta']['size'];
  if (!isRecord(size) || typeof size['w'] !== 'number' || typeof size['h'] !== 'number') {
    return null;
  }
  const frames = new Map<string, FrameRect>();
  for (const [name, entry] of Object.entries(json['frames'])) {
    const rect = isRecord(entry) ? entry['frame'] : undefined;
    if (!isRecord(rect)) continue;
    const { x, y, w, h } = rect;
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      typeof w === 'number' &&
      typeof h === 'number'
    ) {
      frames.set(name, { x, y, w, h });
    }
  }
  return { url, size: { w: size['w'], h: size['h'] }, frames };
}

/**
 * Loads the frame table of an atlas family once (spec.md §4.14). Resolves to null when the
 * family is not shipped or cannot be read, so callers fall back to vector icons.
 */
export function loadAtlasFrames(family: string): Promise<AtlasFrames | null> {
  let pending = cache.get(family);
  if (!pending) {
    const listed = loadAtlasManifest().atlases.some((a) => a === family);
    const base = `${import.meta.env.BASE_URL}assets/atlases/${family}`;
    pending =
      listed && typeof fetch === 'function'
        ? fetch(`${base}.json`)
            .then((response) => (response.ok ? response.json() : null))
            .then((json: unknown) => parseAtlas(`${base}.png`, json))
            .catch(() => null)
        : Promise.resolve(null);
    cache.set(family, pending);
  }
  return pending;
}
