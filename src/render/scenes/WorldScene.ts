import Phaser from 'phaser';
import { TICK_MS } from '../../core/constants';
import { isSimulating } from '../../core/game/state';
import type { SimEvent } from '../../core/sim/step';
import type { Catalogs } from '../../data/schemas/catalogs';
import { exposeForTests } from '../../lib/testHook';
import { createEditorController, previewAt } from '../../state/editorController';
import { describeEvent } from '../../state/eventMessages';
import type { ReadySession } from '../../state/gameStore';
import { networkReport } from '../../state/selectors';
import type { AppStores } from '../../state/stores';
import { CameraController } from '../camera/CameraController';
import { ObjectLayer, TrackLayer } from '../layers/EntityLayers';
import { GhostLayer } from '../layers/GhostLayer';
import { NetworkOverlay } from '../layers/NetworkOverlay';
import { atlasLookup, drawGrid, drawStations } from '../layers/staticLayers';
import { TerrainLayer } from '../layers/TerrainLayer';
import { TrainLayer } from '../layers/TrainLayer';
import { createPlaceholders } from '../textureFactory';

/** At most this many ticks per frame and per speed step; a longer stall drops the backlog. */
const MAX_TICKS_PER_FRAME = 8;

export type WorldSceneData = {
  readonly catalogs: Catalogs;
  /** Atlas families available in public/assets/atlases. */
  readonly atlases: readonly string[];
};

/**
 * Renders the world, owns the camera and pointer input, and drives the fixed-timestep simulation
 * clock (spec.md §3.2). Holds no game state: everything it shows is a projection of the stores.
 */
export class WorldScene extends Phaser.Scene {
  private accumulator = 0;
  private trains: TrainLayer | null = null;

  constructor(
    private readonly stores: AppStores,
    private readonly sceneData: WorldSceneData,
  ) {
    super({ key: 'world' });
  }

  preload(): void {
    const base = `${import.meta.env.BASE_URL}assets/atlases/`;
    for (const atlas of this.sceneData.atlases) {
      this.load.atlas(atlas, `${base}${atlas}.png`, `${base}${atlas}.json`);
    }
  }

  create(): void {
    const { game, editor, view } = this.stores;
    const initial = readySession(this.stores);
    if (!initial) return;
    const { catalogs } = this.sceneData;
    const world = initial.game.world;
    const atlases = atlasLookup(this.textures);

    createPlaceholders(this, catalogs);
    const terrain = new TerrainLayer(this, catalogs, atlases, world);
    drawStations(this, world);
    const grid = drawGrid(this, world).setVisible(view.getState().showGrid);
    const tracks = new TrackLayer(this, catalogs);
    const objects = new ObjectLayer(this, catalogs, atlases);
    this.trains = new TrainLayer(this, catalogs);
    const network = new NetworkOverlay(this);
    const ghost = new GhostLayer(this, catalogs, atlases, terrain);
    tracks.sync(world.tracks);
    objects.sync(world.objects);

    const camera = new CameraController(this, view, world);
    exposeForTests('cellToCanvas', (cell) => camera.cellToCanvas(cell));
    const controller = createEditorController(this.stores);

    const refreshOverlays = () => {
      const session = readySession(this.stores);
      if (!session) return;
      const { rotation, inspected, showNetwork } = editor.getState();
      // Tools only act in Editor Mode, so the ghost is hidden while running.
      const tool = session.game.mode === 'editing' ? editor.getState().tool : null;
      const { hoverCell } = view.getState();
      const w = session.game.world;
      ghost.render({
        cell: hoverCell,
        tool,
        rotation,
        inspected,
        world: w,
        preview: hoverCell ? previewAt(session, tool, rotation, hoverCell) : null,
      });
      network.render(showNetwork ? networkReport(w, catalogs) : null, w);
    };

    // Pointer input: editor tools, or run-mode clicks (panning gestures belong to the camera).
    let toolPointerDown = false;
    const onDown = (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || camera.isPanGesture(pointer)) return;
      const cell = camera.cellAt(pointer);
      if (!cell) return;
      toolPointerDown = true;
      controller.down(cell);
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!toolPointerDown || camera.isPanGesture(pointer)) return;
      const cell = camera.cellAt(pointer);
      if (cell) controller.drag(cell);
    };
    const onUp = () => {
      if (!toolPointerDown) return;
      toolPointerDown = false;
      controller.up();
    };
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);
    this.input.on('pointerupoutside', onUp);

    const unsubscribers = [
      game.subscribe((state, prev) => {
        const next = state.session;
        const before = prev.session;
        if (next.status !== 'ready' || before.status !== 'ready') return;
        const worldChanged = next.game.world !== before.game.world;
        if (worldChanged) {
          terrain.update(before.game.world, next.game.world);
          tracks.sync(next.game.world.tracks);
          objects.sync(next.game.world.objects);
        }
        // Ticks only move trains: skip the (comparatively costly) overlay refresh for them.
        if (
          worldChanged ||
          next.game.mode !== before.game.mode ||
          next.game.trains.length !== before.game.trains.length
        ) {
          refreshOverlays();
        }
      }),
      editor.subscribe(refreshOverlays),
      view.subscribe((state, prev) => {
        if (state.showGrid !== prev.showGrid) grid.setVisible(state.showGrid);
        if (state.hoverCell !== prev.hoverCell) refreshOverlays();
      }),
    ];
    refreshOverlays();

    // game.destroy() emits DESTROY without SHUTDOWN, so listen to both.
    const cleanup = () => {
      onUp();
      camera.destroy();
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe();
      });
      unsubscribers.length = 0;
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.input.off('pointerupoutside', onUp);
      this.trains = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);

    view.getState().setSceneReady(true);
  }

  /** Fixed-timestep simulation clock; rendering interpolates between ticks. */
  override update(_time: number, delta: number): void {
    const session = readySession(this.stores);
    if (!session || !this.trains) return;
    const { game, editor, view } = this.stores;

    if (!isSimulating(session.game)) {
      this.accumulator = 0;
    } else {
      const speed = view.getState().simSpeed;
      this.accumulator += delta * speed;
      const maxTicks = MAX_TICKS_PER_FRAME * speed;
      let ticks = Math.floor(this.accumulator / TICK_MS);
      if (ticks > maxTicks) {
        ticks = maxTicks;
        this.accumulator = 0; // drop the backlog after a stall instead of fast-forwarding
      } else {
        this.accumulator -= ticks * TICK_MS;
      }
      if (ticks > 0) {
        const events = game.getState().tick(ticks);
        reportEvents(events, this.stores, editor);
        for (const event of events) {
          if (event.type === 'train_crashed') this.trains.crash(event.cell);
        }
      }
    }

    const current = readySession(this.stores) ?? session;
    const alpha = isSimulating(current.game) ? this.accumulator / TICK_MS : 0;
    this.trains.render(
      current.game.trains,
      current.game.world,
      alpha,
      editor.getState().selectedTrain,
    );
  }
}

function readySession({ game }: AppStores): ReadySession | null {
  const { session } = game.getState();
  return session.status === 'ready' ? session : null;
}

/** Turns simulation events into player notices. */
function reportEvents(
  events: readonly SimEvent[],
  { game }: AppStores,
  editor: AppStores['editor'],
): void {
  const session = game.getState().session;
  if (session.status !== 'ready') return;
  for (const event of events) {
    const message = describeEvent(event, session);
    if (message) editor.getState().notify(message.text, message.tone);
    // A destroyed train can no longer be selected.
    if (
      event.type === 'train_crashed' &&
      event.trains.some((t) => t.id === editor.getState().selectedTrain)
    ) {
      editor.getState().selectTrain(null);
    }
  }
}
