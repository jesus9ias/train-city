import { useEffect } from 'react';
import type { AppStores } from '../state/stores';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));

const isOnMap = (target: EventTarget | null) =>
  target === document.body || target instanceof HTMLCanvasElement;

/** Global editor shortcuts (spec.md §13). */
export function useShortcuts({ game, editor, view }: AppStores): void {
  useEffect(() => {
    const running = () => {
      const { session } = game.getState();
      return session.status === 'ready' && session.game.mode === 'running';
    };
    const toggleMode = () => {
      if (running()) game.getState().enterEditor();
      else game.getState().startRun();
    };
    const togglePause = () => {
      const { session } = game.getState();
      if (session.status === 'ready' && running()) game.getState().setPaused(!session.game.paused);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;

      if (ctrl && key === 'z' && !event.shiftKey) game.getState().undo();
      else if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) game.getState().redo();
      else if (ctrl || event.altKey) return;
      // Tab still moves focus between controls; it only switches modes from the map.
      else if (key === 'tab' && !event.shiftKey && isOnMap(event.target)) toggleMode();
      else if (key === 'p') togglePause();
      else if (key === 'r') editor.getState().rotate();
      else if (key === 'g') view.getState().toggleGrid();
      else if (key === 'i') editor.getState().selectTool({ kind: 'inspect' });
      else if (key === 'delete' || key === 'backspace')
        editor.getState().selectTool({ kind: 'erase' });
      else if (key === 'escape') {
        editor.getState().selectTool(null);
        editor.getState().inspect(null);
        editor.getState().selectTrain(null);
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [game, editor, view]);
}
