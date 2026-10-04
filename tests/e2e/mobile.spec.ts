import { devices, expect, test, type CDPSession, type Page } from '@playwright/test';

// Stage 7b (spec.md §13.1): a Chromium phone with touch.
test.use({ ...devices['Pixel 5'] });

type Point = { x: number; y: number };

async function open(page: Page, levelId = 'level-001') {
  await page.goto(`/?level=${levelId}`);
  await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);
}

/** Page coordinates of a cell's center. */
async function cellOnPage(page: Page, cell: Point): Promise<Point> {
  const box = await page.locator('[data-testid="game-canvas"] canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const p = await page.evaluate((c) => {
    const probe = window.__TRAINCITY__?.cellToCanvas;
    if (!probe) throw new Error('cellToCanvas probe missing');
    return probe(c);
  }, cell);
  return { x: box.x + p.x, y: box.y + p.y };
}

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: Point[],
) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })),
  });
}

/** Moves fingers from `from` to `to` in small steps, like a real gesture. */
async function gesture(page: Page, from: Point[], to: Point[]) {
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', from);
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const at = from.map((f, k) => {
      const t = to[k] ?? f;
      return { x: f.x + ((t.x - f.x) * i) / steps, y: f.y + ((t.y - f.y) * i) / steps };
    });
    await touch(cdp, 'touchMove', at);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd', []);
}

/** An empty grass cell whose center is visible near the middle of the canvas. */
async function emptyVisibleCell(page: Page): Promise<Point> {
  const box = await page.locator('[data-testid="game-canvas"] canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  return page.evaluate(
    ({ w, h }) => {
      const hook = window.__TRAINCITY__;
      const session = hook?.stores.game.getState().session;
      if (!hook?.cellToCanvas || session?.status !== 'ready') throw new Error('not ready');
      const { world } = session.game;
      const { catalogs } = session.ctx;
      const taken = (x: number, y: number) =>
        world.tracks.some((t) => t.at.x === x && t.at.y === y) ||
        world.objects.some((o) => {
          const fp = catalogs.objects[o.type]?.footprint ?? { w: 1, h: 1 };
          return x >= o.at.x && x < o.at.x + fp.w && y >= o.at.y && y < o.at.y + fp.h;
        });
      for (let y = 0; y < world.rows; y++) {
        for (let x = 0; x < world.cols; x++) {
          const p = hook.cellToCanvas({ x, y });
          const central = Math.abs(p.x - w / 2) < w / 4 && Math.abs(p.y - h / 2) < h / 4;
          if (central && world.terrain[y * world.cols + x] === 'grass' && !taken(x, y)) {
            return { x, y };
          }
        }
      }
      throw new Error('no empty cell in view');
    },
    { w: box.width, h: box.height },
  );
}

const trackCount = (page: Page) =>
  page.evaluate(() => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    return session?.status === 'ready' ? session.game.world.tracks.length : -1;
  });

test.describe('Playing on a phone (Stage 7b)', () => {
  test('the map fills the screen and panels are drawers', async ({ page }) => {
    await open(page);
    const viewport = page.viewportSize();
    const box = await page.getByTestId('game-canvas').boundingBox();
    expect(box?.width).toBe(viewport?.width);
    expect(box?.height).toBeGreaterThan(400);
    await expect(page.getByTestId('drawer-tools')).toBeHidden();
    await expect(page.getByTestId('drawer-info')).toBeHidden();

    await page.getByRole('button', { name: 'Info' }).click();
    await expect(page.getByTestId('drawer-info')).toBeVisible();
    await expect(page.getByTestId('objective-o1')).toHaveText('0/50');
    await page.getByTestId('drawer-info').getByRole('button', { name: 'Close panel' }).click();
    await expect(page.getByTestId('drawer-info')).toBeHidden();

    await page.getByRole('button', { name: 'Game menu' }).click();
    await expect(page.getByRole('button', { name: 'Download game' })).toBeVisible();
  });

  test('pick a tool from the drawer and place it with a tap', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Build' }).click();
    await page.getByRole('button', { name: /Curve/ }).click();
    await expect(page.getByTestId('drawer-tools')).toBeHidden();
    await expect(page.getByTestId('active-tool')).toHaveText('Curve · 0°');
    await page.getByRole('button', { name: 'Rotate piece' }).click();
    await expect(page.getByTestId('active-tool')).toHaveText('Curve · 90°');

    const before = await trackCount(page);
    const target = await cellOnPage(page, await emptyVisibleCell(page));
    await page.touchscreen.tap(target.x, target.y);
    await expect.poll(() => trackCount(page)).toBe(before + 1);

    await page.getByRole('button', { name: 'Deselect tool' }).click();
    await expect(page.getByTestId('active-tool')).toBeHidden();
  });

  test('one finger pans when no tool is active, and builds nothing', async ({ page }) => {
    await open(page);
    const tracks = await trackCount(page);
    const before = await cellOnPage(page, { x: 25, y: 20 });
    await gesture(page, [{ x: 250, y: 500 }], [{ x: 150, y: 380 }]);
    const after = await cellOnPage(page, { x: 25, y: 20 });
    expect(after.y).toBeLessThan(before.y - 60);
    expect(after.x).toBeLessThan(before.x - 60);
    expect(await trackCount(page)).toBe(tracks);
  });

  test('pinch zooms in one step', async ({ page }) => {
    await open(page);
    const tracks = await trackCount(page);
    await gesture(
      page,
      [
        { x: 150, y: 400 },
        { x: 250, y: 400 },
      ],
      [
        { x: 125, y: 400 },
        { x: 275, y: 400 },
      ],
    );
    await expect(page.getByTestId('zoom-level')).toHaveText('Zoom 2×');
    expect(await trackCount(page)).toBe(tracks);
  });
});
