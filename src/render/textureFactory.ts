import type Phaser from 'phaser';
import { PALETTE } from '../art/palette';
import { CELL_SIZE } from '../core/constants';
import { hashString, variantIndex } from '../core/grid/variant';
import { routePoint, routeShape } from '../core/track/geometry';
import { activeRouteIndex, pieceRoutes } from '../core/track/routes';
import type { Facing } from '../core/sim/facing';
import type {
  Catalogs,
  LocomotiveDef,
  ObjectDef,
  TerrainDef,
  TrackPieceDef,
  WagonDef,
} from '../data/schemas/catalogs';
import { hexToRgb, rgbToCss, shade, type Rgb } from './color';

/** Placeholder terrain textures come in this many variants. */
export const PLACEHOLDER_VARIANTS = 3;

export const placeholderKeys = {
  terrain: (id: string, variant: number) => `ph:terrain:${id}:${variant}`,
  object: (id: string) => `ph:object:${id}`,
  track: (piece: string, rotation: number, state: number) =>
    `ph:track:${piece}:${rotation}:${state}`,
  platform: (axis: 'vertical' | 'horizontal') => `ph:platform:${axis}`,
  vehicle: (model: string, facing: Facing) => `ph:vehicle:${model}:${facing}`,
};

// Fixed details use palette colors (ADR-002); bodies come from each catalog entry's color.
const HEADLIGHT = hexToRgb(PALETTE.yellow);
const WINDOW = hexToRgb(PALETTE.cyan);

const SLEEPER = hexToRgb(PALETTE.bark);
const RAIL = hexToRgb(PALETTE.silver);
const RAIL_SHADOW = hexToRgb(PALETTE.ink);
const RAIL_INACTIVE = hexToRgb(PALETTE.slate);
const BUMPER = hexToRgb(PALETTE.red);
const PLATFORM = hexToRgb(PALETTE.silver);

type Plot = (x: number, y: number, color: Rgb) => void;

/** Creates a canvas texture drawn pixel by pixel. Does nothing if the key already exists. */
function paint(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (plot: Plot) => void,
) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.context;
  draw((x, y, color) => {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    ctx.fillStyle = rgbToCss(color);
    ctx.fillRect(px, py, 1, 1);
  });
  texture.refresh();
}

function paintTerrain(scene: Phaser.Scene, terrain: TerrainDef, variant: number) {
  const base = hexToRgb(terrain.color);
  const salt = hashString(terrain.id) + variant * 7919;
  paint(scene, placeholderKeys.terrain(terrain.id, variant), CELL_SIZE, CELL_SIZE, (plot) => {
    for (let y = 0; y < CELL_SIZE; y++) {
      for (let x = 0; x < CELL_SIZE; x++) {
        const speckle = variantIndex(x, y, 16, salt);
        plot(x, y, speckle === 0 ? shade(base, -0.12) : speckle === 1 ? shade(base, 0.1) : base);
      }
    }
  });
}

function paintObject(scene: Phaser.Scene, object: ObjectDef) {
  const width = object.footprint.w * CELL_SIZE;
  const height = object.footprint.h * CELL_SIZE;
  const base = hexToRgb(object.render.color);
  const outline = shade(base, -0.45);
  const light = shade(base, 0.2);

  paint(scene, placeholderKeys.object(object.id), width, height, (plot) => {
    if (object.render.shape === 'circle') {
      const cx = width / 2;
      const cy = height / 2;
      const r = Math.min(width, height) / 2 - 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > r) continue;
          const highlight = x + 0.5 < cx - r / 4 && y + 0.5 < cy - r / 4 && d < r - 2;
          plot(x, y, d > r - 1 ? outline : highlight ? light : base);
        }
      }
      return;
    }
    // Buildings get a darker roof band; nature "rects" (e.g. cactus) are narrow.
    const inset = object.category === 'building' ? 2 : Math.floor(width * 0.3);
    const roofHeight = object.category === 'building' ? Math.floor(height * 0.35) : 0;
    const roof = shade(base, -0.25);
    for (let y = 2; y < height - 2; y++) {
      for (let x = inset; x < width - inset; x++) {
        const edge = x === inset || x === width - inset - 1 || y === 2 || y === height - 3;
        plot(x, y, edge ? outline : y < 2 + roofHeight ? roof : base);
      }
    }
  });
}

function paintPlatform(scene: Phaser.Scene, axis: 'vertical' | 'horizontal') {
  const edge = shade(PLATFORM, -0.3);
  paint(scene, placeholderKeys.platform(axis), CELL_SIZE, CELL_SIZE, (plot) => {
    for (let y = 0; y < CELL_SIZE; y++) {
      for (let x = 0; x < CELL_SIZE; x++) {
        const along = axis === 'vertical' ? x : y;
        const isEdge = along === 0 || along === CELL_SIZE - 1;
        plot(x, y, isEdge ? edge : PLATFORM);
      }
    }
  });
}

/** Maps a pixel drawn facing north to the same pixel for another facing (lossless 90° turns). */
function orient(x: number, y: number, facing: Facing): [number, number] {
  const max = CELL_SIZE - 1;
  switch (facing) {
    case 'N':
      return [x, y];
    case 'E':
      return [max - y, x];
    case 'S':
      return [max - x, max - y];
    case 'W':
      return [y, max - x];
  }
}

const FACINGS: readonly Facing[] = ['N', 'E', 'S', 'W'];

/** A vehicle seen from above, nose up (north); 12 px wide, centered in the cell. */
function paintVehicle(
  scene: Phaser.Scene,
  model: LocomotiveDef | WagonDef,
  kind: 'locomotive' | 'wagon',
) {
  const base = hexToRgb(model.render.color);
  const outline = shade(base, -0.5);
  const light = shade(base, 0.25);
  for (const facing of FACINGS) {
    paint(scene, placeholderKeys.vehicle(model.id, facing), CELL_SIZE, CELL_SIZE, (plot) => {
      const top = kind === 'locomotive' ? 1 : 2;
      const bottom = CELL_SIZE - (kind === 'locomotive' ? 2 : 3);
      for (let y = top; y <= bottom; y++) {
        for (let x = 4; x <= 15; x++) {
          const edge = x === 4 || x === 15 || y === top || y === bottom;
          let color = edge ? outline : base;
          if (!edge && kind === 'locomotive') {
            if (y <= top + 2)
              color = light; // nose
            else if (y >= bottom - 6 && y <= bottom - 4 && x >= 6 && x <= 13) color = WINDOW; // cab
          }
          if (!edge && kind === 'wagon' && (y === top + 5 || y === bottom - 5)) color = outline;
          plot(...orient(x, y, facing), color);
        }
      }
      if (kind === 'locomotive') {
        plot(...orient(6, top + 1, facing), HEADLIGHT);
        plot(...orient(13, top + 1, facing), HEADLIGHT);
      }
    });
  }
}

/** Creates every placeholder texture that depends only on the catalogs. */
export function createPlaceholders(scene: Phaser.Scene, catalogs: Catalogs): void {
  for (const terrain of Object.values(catalogs.terrains)) {
    for (let v = 0; v < PLACEHOLDER_VARIANTS; v++) paintTerrain(scene, terrain, v);
  }
  for (const object of Object.values(catalogs.objects)) paintObject(scene, object);
  paintPlatform(scene, 'vertical');
  paintPlatform(scene, 'horizontal');
  for (const loco of Object.values(catalogs.locomotives)) paintVehicle(scene, loco, 'locomotive');
  for (const wagon of Object.values(catalogs.wagons)) paintVehicle(scene, wagon, 'wagon');
}

/** Placeholder texture for a placed track, generated on first use. Returns its key. */
export function trackTexture(
  scene: Phaser.Scene,
  piece: TrackPieceDef,
  rotation: number,
  state: number,
): string {
  const key = placeholderKeys.track(piece.id, rotation, state);
  const routes = pieceRoutes(piece, rotation);
  const active = activeRouteIndex(piece, state);
  // Draw inactive routes first so the active one ends up on top.
  const order = routes.map((_, i) => i).sort((a, b) => Number(a === active) - Number(b === active));

  paint(scene, key, CELL_SIZE, CELL_SIZE, (plot) => {
    const samples = (length: number) => Math.max(8, Math.ceil(length * CELL_SIZE * 3));
    const shapes = order.flatMap((index) => {
      const route = routes[index];
      return route ? [{ index, route, shape: routeShape(route[0], route[1]) }] : [];
    });

    // Sleepers under every route.
    for (const { shape } of shapes) {
      const spacing = 4 / (shape.length * CELL_SIZE);
      for (let t = spacing / 2; t < 1; t += spacing) {
        const { p, n } = frame(shape, t);
        for (let s = -6; s <= 6; s += 0.5) plot(p.x + n.x * s, p.y + n.y * s, SLEEPER);
      }
    }
    // Rails, with a shadow pixel for a little depth.
    for (const { index, route, shape } of shapes) {
      const color = index === active || !piece.stateful ? RAIL : RAIL_INACTIVE;
      const count = samples(shape.length);
      for (let k = 0; k <= count; k++) {
        const { p, n } = frame(shape, k / count);
        for (const side of [-4, 4]) {
          plot(p.x + n.x * side, p.y + n.y * side + 1, RAIL_SHADOW);
          plot(p.x + n.x * side, p.y + n.y * side, color);
        }
      }
      // Dead ends get a bumper across the track at the cell center.
      if (route[1] === null) {
        const { p, n } = frame(shape, 1);
        const tangent = { x: n.y, y: -n.x };
        for (let s = -6; s <= 6; s += 0.5) {
          for (const d of [0, -1]) {
            plot(p.x + n.x * s + tangent.x * d, p.y + n.y * s + tangent.y * d, BUMPER);
          }
        }
      }
    }
  });
  return key;
}

/** Point and unit normal (in pixels) at fraction t along a route shape. */
function frame(shape: ReturnType<typeof routeShape>, t: number) {
  const eps = 0.01;
  const a = routePoint(shape, Math.max(0, t - eps));
  const b = routePoint(shape, Math.min(1, t + eps));
  const p = routePoint(shape, t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    p: { x: p.x * CELL_SIZE, y: p.y * CELL_SIZE },
    n: { x: -dy / len, y: dx / len },
  };
}
