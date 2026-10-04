import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testCatalogs } from '../test/fixtures';

const atlasJson = {
  frames: {
    straight_0: { frame: { x: 1, y: 1, w: 20, h: 20 } },
    house_s_0: { frame: { x: 22, y: 1, w: 40, h: 40 } },
    broken: { frame: 'nope' },
  },
  meta: { size: { w: 64, h: 42 } },
};

/** Fresh module state per test: the frame cache lives in atlasFrames. */
async function importFresh() {
  vi.resetModules();
  const icons = await import('./icons');
  const frames = await import('./atlasFrames');
  return { ...icons, ...frames };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('palette icons from the atlases', () => {
  it('shows the atlas frame, scaled to the icon size', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(atlasJson)))),
    );
    const { TrackIcon, ObjectIcon } = await importFresh();
    const straight = testCatalogs.pieces['straight'];
    const house = testCatalogs.objects['house_s'];
    if (!straight || !house) throw new Error('missing catalog entries');
    const { container } = render(
      <>
        <TrackIcon piece={straight} rotation={90} />
        <ObjectIcon object={house} />
      </>,
    );
    const track = await screen.findByTestId('sprite-straight_0');
    expect(track).toHaveStyle({ width: '20px', backgroundPosition: '-1px -1px' });
    expect(track.style.transform).toBe('rotate(90deg)');
    const object = await screen.findByTestId('sprite-house_s_0');
    // 40 px frames are shown at half size in a 20 px icon.
    expect(object).toHaveStyle({ width: '20px', backgroundPosition: '-11px -0.5px' });
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('keeps the vector icon when the atlas cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const { TerrainIcon, loadAtlasFrames } = await importFresh();
    const grass = testCatalogs.terrains['grass'];
    if (!grass) throw new Error('missing grass');
    const { container } = render(<TerrainIcon terrain={grass} />);
    expect(await loadAtlasFrames('terrain')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('rejects malformed atlas files and unknown families', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"frames": 3}'))),
    );
    const { loadAtlasFrames } = await importFresh();
    expect(await loadAtlasFrames('tracks')).toBeNull();
    expect(await loadAtlasFrames('not-an-atlas')).toBeNull();
  });
});
