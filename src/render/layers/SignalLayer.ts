import type Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { signalAspects } from '../../core/sim/signals';
import type { TrainState } from '../../core/sim/train';
import { signalPost } from '../../core/track/geometry';
import { cellKey, type PlacedTrack, type WorldState } from '../../core/world/world';
import type { Catalogs } from '../../data/schemas/catalogs';
import type { AtlasLookup } from '../sprites';
import { DEPTH, warnMissingSprite } from './staticLayers';

const ASPECT_COLOR = { red: 0xe43b44, green: 0x63c74d } as const; // palette: red, lime

/**
 * Lamp center of a signal, in world pixels. Track frames are drawn at 0° or 45° and turned in
 * 90° steps around the cell center, so the lamp follows the same pixel grid as its post.
 */
function lampPosition(track: PlacedTrack): { x: number; y: number } {
  const drawn = track.rotation % 90;
  const { lamp } = signalPost(drawn);
  const px = Math.floor(lamp.x * CELL_SIZE) + 0.5 - CELL_SIZE / 2;
  const py = Math.floor(lamp.y * CELL_SIZE) + 0.5 - CELL_SIZE / 2;
  const turn = ((track.rotation - drawn) * Math.PI) / 180;
  const cos = Math.round(Math.cos(turn));
  const sin = Math.round(Math.sin(turn));
  return {
    x: (track.at.x + 0.5) * CELL_SIZE + px * cos - py * sin,
    y: (track.at.y + 0.5) * CELL_SIZE + px * sin + py * cos,
  };
}

/** Red/green lamps on signal posts, derived from block occupancy (spec.md §4.10.1). */
export class SignalLayer {
  private readonly lamps = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Arc>();
  private lastTracks: readonly PlacedTrack[] | null = null;
  private lastTrains: readonly TrainState[] | null = null;
  private lastAspects = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly catalogs: Catalogs,
    private readonly atlases: AtlasLookup,
  ) {}

  render(world: WorldState, trains: readonly TrainState[]): void {
    if (world.tracks === this.lastTracks && trains === this.lastTrains) return;
    const tracksChanged = world.tracks !== this.lastTracks;
    this.lastTracks = world.tracks;
    this.lastTrains = trains;
    const aspects = signalAspects(world, this.catalogs.pieces, trains);

    for (const [key, lamp] of this.lamps) {
      if (aspects.has(key) && !tracksChanged) continue;
      lamp.destroy();
      this.lamps.delete(key);
      this.lastAspects.delete(key);
    }
    for (const track of world.tracks) {
      const key = cellKey(track.at);
      const aspect = aspects.get(key);
      if (!aspect || this.lastAspects.get(key) === aspect) continue;
      this.lamps.get(key)?.destroy();
      const { x, y } = lampPosition(track);
      const frame = `signal_${aspect}`;
      let lamp: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
      if (this.atlases.hasFrame('ui', frame)) {
        lamp = this.scene.add.image(x, y, 'ui', frame);
      } else {
        warnMissingSprite(`ui:${frame}`, `Missing sprite ui/${frame}; drawing a placeholder`);
        lamp = this.scene.add.circle(x, y, 1.5, ASPECT_COLOR[aspect]);
      }
      this.lamps.set(key, lamp.setDepth(DEPTH.tracks + 0.5));
      this.lastAspects.set(key, aspect);
    }
  }
}
