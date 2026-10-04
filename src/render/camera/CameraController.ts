import Phaser from 'phaser';
import { CELL_SIZE } from '../../core/constants';
import { pixelToCell } from '../../core/grid/coords';
import { clampScroll } from '../../core/view/camera';
import { anchoredScroll, stepZoom } from '../../core/view/zoom';
import type { ViewStore } from '../../state/viewStore';

/** How far past the map edges the camera may scroll. */
const CAMERA_MARGIN_CELLS = 2;

type MapSize = { readonly widthPx: number; readonly heightPx: number };

/**
 * Pan, zoom and hover tracking for a scene's main camera. Zoom is mirrored in the view store so
 * React controls and the mouse wheel stay in sync.
 */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly spaceKey: Phaser.Input.Keyboard.Key | undefined;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: ViewStore,
    private readonly map: MapSize,
  ) {
    this.camera = scene.cameras.main;
    this.camera.setZoom(view.getState().zoom);
    this.camera.centerOn(map.widthPx / 2, map.heightPx / 2);
    this.clamp();

    this.spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.listenToPointer();
    this.keepCenterOnResize();
    this.disposers.push(
      view.subscribe((state, prev) => {
        if (state.zoom !== prev.zoom && state.zoom !== this.camera.zoom) {
          this.zoomTo(state.zoom, this.camera.width / 2, this.camera.height / 2);
        }
      }),
    );
  }

  destroy(): void {
    this.disposers.forEach((dispose) => {
      dispose();
    });
    this.disposers.length = 0;
  }

  /** Middle-button drag, or Space + left drag. Tools must ignore these pointer events. */
  isPanGesture(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.middleButtonDown() || (this.spaceKey?.isDown === true && pointer.leftButtonDown())
    );
  }

  /** World cell under a pointer, or null outside the map. */
  cellAt(pointer: Phaser.Input.Pointer) {
    const world = this.camera.getWorldPoint(pointer.x, pointer.y);
    return pixelToCell(world.x, world.y, this.map.widthPx, this.map.heightPx);
  }

  /** Canvas pixel at the center of a cell (inverse of `cellAt`). */
  cellToCanvas(cell: { x: number; y: number }): { x: number; y: number } {
    const { camera } = this;
    const toScreen = (world: number, scroll: number, size: number) =>
      (world - scroll - size / 2) * camera.zoom + size / 2;
    return {
      x: toScreen((cell.x + 0.5) * CELL_SIZE, camera.scrollX, camera.width),
      y: toScreen((cell.y + 0.5) * CELL_SIZE, camera.scrollY, camera.height),
    };
  }

  /** Keeps the map in view; centers it when it is smaller than the viewport. */
  private clamp(): void {
    const { camera, map } = this;
    const margin = CAMERA_MARGIN_CELLS * CELL_SIZE;
    camera.scrollX = clampScroll(camera.scrollX, camera.width, camera.zoom, map.widthPx, margin);
    camera.scrollY = clampScroll(camera.scrollY, camera.height, camera.zoom, map.heightPx, margin);
  }

  /** Zooms keeping the world point under the screen anchor (x, y) fixed. */
  private zoomTo(zoom: number, anchorX: number, anchorY: number): void {
    const { camera } = this;
    if (zoom === camera.zoom) return;
    camera.scrollX = anchoredScroll(camera.scrollX, camera.width, anchorX, camera.zoom, zoom);
    camera.scrollY = anchoredScroll(camera.scrollY, camera.height, anchorY, camera.zoom, zoom);
    camera.setZoom(zoom);
    this.clamp();
    this.view.getState().setZoom(zoom);
  }

  private listenToPointer(): void {
    const { scene, camera, view } = this;

    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (this.isPanGesture(pointer)) {
        camera.scrollX -= (pointer.x - pointer.prevPosition.x) / camera.zoom;
        camera.scrollY -= (pointer.y - pointer.prevPosition.y) / camera.zoom;
        this.clamp();
      }
      view.getState().setHoverCell(this.cellAt(pointer));
    };
    const onOut = () => {
      view.getState().setHoverCell(null);
    };
    const onWheel = (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (dy === 0) return;
      this.zoomTo(stepZoom(camera.zoom, dy > 0 ? -1 : 1), pointer.x, pointer.y);
    };

    scene.input.on('pointermove', onMove);
    scene.input.on('gameout', onOut);
    scene.input.on('wheel', onWheel);
    this.disposers.push(() => {
      scene.input.off('pointermove', onMove);
      scene.input.off('gameout', onOut);
      scene.input.off('wheel', onWheel);
    });
  }

  /** Keeps the world point at the viewport center fixed when the canvas is resized. */
  private keepCenterOnResize(): void {
    const { camera, scene } = this;
    let lastWidth = camera.width;
    let lastHeight = camera.height;
    const onResize = (size: Phaser.Structs.Size) => {
      camera.scrollX += (lastWidth - size.width) / 2;
      camera.scrollY += (lastHeight - size.height) / 2;
      lastWidth = size.width;
      lastHeight = size.height;
      this.clamp();
    };
    scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.disposers.push(() => scene.scale.off(Phaser.Scale.Events.RESIZE, onResize));
  }
}
