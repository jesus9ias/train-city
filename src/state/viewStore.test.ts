import { describe, expect, it, vi } from 'vitest';
import { createViewStore } from './viewStore';

describe('viewStore', () => {
  it('steps zoom in and out', () => {
    const store = createViewStore();
    store.getState().zoomIn();
    expect(store.getState().zoom).toBe(2);
    store.getState().zoomOut();
    store.getState().zoomOut();
    expect(store.getState().zoom).toBe(0.5);
  });

  it('toggles the grid', () => {
    const store = createViewStore();
    store.getState().toggleGrid();
    expect(store.getState().showGrid).toBe(false);
  });

  it('only notifies when the hovered cell actually changes', () => {
    const store = createViewStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setHoverCell({ x: 1, y: 2 });
    store.getState().setHoverCell({ x: 1, y: 2 });
    store.getState().setHoverCell(null);
    store.getState().setHoverCell(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
