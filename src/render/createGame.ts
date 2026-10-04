import Phaser from 'phaser';
import type { AppStores } from '../state/stores';
import { WorldScene, type WorldSceneData } from './scenes/WorldScene';

const BACKGROUND = '#1b1d24';

export function createGame(
  parent: HTMLElement,
  stores: AppStores,
  data: WorldSceneData,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: BACKGROUND,
    pixelArt: true,
    roundPixels: true,
    disableContextMenu: true,
    // No sound until the audio stage; also avoids AudioContext errors on StrictMode remounts.
    audio: { noAudio: true },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    scene: new WorldScene(stores, data),
  });
}
