import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import type { ActionOutcome } from '../../core/editor/actions';
import type { Cell } from '../../core/grid/coords';
import { poseIn } from '../../core/sim/facing';
import { facingFromRotation, layoutTrainFacing } from '../../core/sim/placement';
import { snapRotation } from '../../core/track/rotation';
import type { WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { Tool } from '../../state/editorStore';
import type { AtlasLookup } from '../sprites';
import { objectTexture, placeInCell, trackSprite, vehicleTexture } from './EntityLayers';
import { DEPTH } from './staticLayers';
import type { TerrainLayer } from './TerrainLayer';

const VALID = 0x3fb950;
const INVALID = 0xf85149;
const INSPECT = 0xf2b544;

export type GhostInput = {
  readonly cell: Cell | null;
  readonly tool: Tool | null;
  readonly rotation: number;
  readonly preview: ActionOutcome | null;
  readonly inspected: Cell | null;
  readonly world: WorldState;
};

/** Placement preview: the item to place plus a green (valid) or red ✕ (invalid) overlay. */
export class GhostLayer {
  private readonly image: Phaser.GameObjects.Image;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly vehicles: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalogs: Catalogs,
    private readonly atlases: AtlasLookup,
    private readonly terrain: TerrainLayer,
  ) {
    this.image = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(DEPTH.ghost);
    this.image.setAlpha(0.75).setVisible(false);
    this.overlay = scene.add.graphics().setDepth(DEPTH.ghost);
  }

  render({ cell, tool, rotation, preview, inspected, world }: GhostInput): void {
    this.overlay.clear();
    this.image.setVisible(false);
    for (const vehicle of this.vehicles) vehicle.setVisible(false);

    if (inspected) this.outline(inspected, 1, 1, INSPECT, 2);
    if (!cell || !tool) return;
    if (tool.kind === 'inspect') {
      this.outline(cell, 1, 1, INSPECT, 1);
      return;
    }
    if (tool.kind === 'train') {
      this.renderTrain(tool, rotation, cell, preview, world);
      return;
    }

    const size = this.showItem(tool, rotation, cell);
    const color = preview?.ok === false ? INVALID : VALID;
    const x = cell.x * CELL_SIZE;
    const y = cell.y * CELL_SIZE;
    const w = size.w * CELL_SIZE;
    const h = size.h * CELL_SIZE;
    this.overlay.fillStyle(color, 0.25).fillRect(x, y, w, h);
    this.overlay.lineStyle(1, color, 0.9).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (preview?.ok === false) {
      // Color is never the only signal (spec.md §13): invalid placements also get a ✕.
      this.overlay.lineStyle(2, INVALID, 0.9);
      this.overlay.lineBetween(x + 4, y + 4, x + w - 4, y + h - 4);
      this.overlay.lineBetween(x + w - 4, y + 4, x + 4, y + h - 4);
    }
  }

  /** Shows the item being placed and returns its footprint in cells. */
  private showItem(tool: Tool, rotation: number, cell: Cell): { w: number; h: number } {
    const place = (key: string, frame?: string) => {
      this.image.setTexture(key, frame).setOrigin(0, 0).setAngle(0);
      this.image.setPosition(cell.x * CELL_SIZE, cell.y * CELL_SIZE).setVisible(true);
    };
    if (tool.kind === 'track') {
      const piece = this.catalogs.pieces[tool.piece];
      if (piece) {
        const texture = trackSprite(
          this.scene,
          piece,
          this.atlases,
          snapRotation(piece, rotation),
          piece.defaultState ?? 0,
        );
        placeInCell(this.image, cell, texture).setVisible(true);
      }
    } else if (tool.kind === 'object') {
      const def = this.catalogs.objects[tool.object];
      const texture = objectTexture(this.catalogs, this.atlases, tool.object, cell.x, cell.y);
      if (texture) place(texture.key, texture.frame);
      if (def) return { w: def.footprint.w, h: def.footprint.h };
    } else if (tool.kind === 'terrain') {
      const texture = this.terrain.textureFor(tool.terrain, cell.x, cell.y);
      if (texture) place(texture.key, texture.frame);
    }
    return { w: 1, h: 1 };
  }

  /** Locomotive and wagons laid along the track, each cell marked valid or invalid. */
  private renderTrain(
    tool: Extract<Tool, { kind: 'train' }>,
    rotation: number,
    cell: Cell,
    preview: ActionOutcome | null,
    world: WorldState,
  ): void {
    const layout = layoutTrainFacing(
      world,
      this.catalogs.pieces,
      cell,
      facingFromRotation(rotation),
      tool.wagons.length,
    );
    const color = preview?.ok === false ? INVALID : VALID;
    if (!layout.ok) {
      this.mark([cell], INVALID, true);
      return;
    }
    const passes = [layout.head, ...layout.trail];
    const models = [tool.locomotive, ...tool.wagons];
    passes.forEach((pass, i) => {
      const pose = poseIn(pass, 0.5);
      let image = this.vehicles[i];
      if (!image) {
        image = this.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.ghost).setAlpha(0.8);
        this.vehicles.push(image);
      }
      const texture = vehicleTexture(this.catalogs, this.atlases, models[i] ?? '', pose.facing);
      image.setTexture(texture.key, texture.frame).setPosition(pose.x, pose.y).setVisible(true);
    });
    this.mark(
      passes.map((p) => p.cell),
      color,
      preview?.ok === false,
    );
  }

  private mark(cells: readonly Cell[], color: number, cross: boolean): void {
    for (const c of cells) {
      const x = c.x * CELL_SIZE;
      const y = c.y * CELL_SIZE;
      this.overlay.fillStyle(color, 0.25).fillRect(x, y, CELL_SIZE, CELL_SIZE);
      this.overlay
        .lineStyle(1, color, 0.9)
        .strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
      if (cross) {
        this.overlay.lineStyle(2, INVALID, 0.9);
        this.overlay.lineBetween(x + 4, y + 4, x + CELL_SIZE - 4, y + CELL_SIZE - 4);
        this.overlay.lineBetween(x + CELL_SIZE - 4, y + 4, x + 4, y + CELL_SIZE - 4);
      }
    }
  }

  private outline(cell: Cell, w: number, h: number, color: number, width: number): void {
    this.overlay.lineStyle(width, color, 1);
    this.overlay.strokeRect(
      cell.x * CELL_SIZE + width / 2,
      cell.y * CELL_SIZE + width / 2,
      w * CELL_SIZE - width,
      h * CELL_SIZE - width,
    );
  }
}
