import { useEffect, useRef } from 'react';
import type { AppStores } from '../state/stores';
import { createGame } from './createGame';
import type { WorldSceneData } from './scenes/WorldScene';

type Props = { stores: AppStores; data: WorldSceneData };

/**
 * Mounts a Phaser game inside a React-managed div. A new `data` object (e.g. another level)
 * recreates the game. Safe under StrictMode double mounting.
 */
export function GameCanvas({ stores, data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const game = createGame(container, stores, data);
    // Phaser only notices window resizes. When the page layout moves or resizes the canvas
    // (e.g. the top bar gains a row in Run Mode), its input bounds would go stale and clicks
    // would land on the wrong cell; refresh them whenever the container changes.
    const observer = new ResizeObserver(() => {
      game.scale.refresh();
      game.scale.updateBounds();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      stores.view.getState().setSceneReady(false);
      // Phaser defers destruction to the next animation frame, which may never come in a
      // hidden tab. Detach the canvas now so a StrictMode remount never shows two canvases.
      game.destroy(true);
      game.canvas.remove();
    };
  }, [stores, data]);

  return <div ref={containerRef} className="game-canvas" data-testid="game-canvas" />;
}
