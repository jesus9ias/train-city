import { expect, test, type Page } from '@playwright/test';

type Cell = { x: number; y: number };

async function openLevel(page: Page, levelId: string) {
  await page.goto(`/?level=${levelId}`);
  await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);
}

/** Page coordinates of a cell's center. */
async function cellPoint(page: Page, cell: Cell) {
  const box = await page.locator('[data-testid="game-canvas"] canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const p = await page.evaluate((c) => {
    const probe = window.__TRAINCITY__?.cellToCanvas;
    if (!probe) throw new Error('cellToCanvas probe missing');
    return probe(c);
  }, cell);
  return { x: box.x + p.x, y: box.y + p.y };
}

async function clickCell(page: Page, cell: Cell) {
  const p = await cellPoint(page, cell);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

/** Snapshot of the editable state, read through the dev-only test hook. */
function readGame(page: Page) {
  return page.evaluate(() => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    if (session?.status !== 'ready') throw new Error('level not ready');
    const { world } = session.game;
    return {
      tracks: world.tracks.map((t) => ({ ...t.at, piece: t.piece, rotation: t.rotation })),
      objects: world.objects.length,
      terrainAt: (x: number, y: number) => world.terrain[y * world.cols + x],
      terrain: world.terrain,
      cols: world.cols,
      undo: session.past.length,
    };
  });
}

test.describe('Editor', () => {
  test('places a rotated straight, charges for it, and undoes it', async ({ page }) => {
    await openLevel(page, 'level-001');
    await expect(page.getByTestId('money')).toHaveText('$2,500');

    await page.getByRole('button', { name: /^Straight/ }).click();
    // A straight turns in 45° steps since Stage 8 (it can be laid diagonally).
    await page.keyboard.press('r');
    await expect(page.getByText('Rotation 45°')).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByText('Rotation 90°')).toBeVisible();

    const cell = { x: 28, y: 25 };
    const p = await cellPoint(page, cell);
    await page.mouse.move(p.x, p.y);
    await expect(page.getByTestId('cursor-tooltip')).toHaveText('Straight · −$10');
    await page.mouse.click(p.x, p.y);

    await expect(page.getByTestId('money')).toHaveText('$2,490');
    await expect(page.getByTestId('build-cost')).toHaveText('Build $10');
    expect((await readGame(page)).tracks).toContainEqual({
      ...cell,
      piece: 'straight',
      rotation: 90,
    });

    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('money')).toHaveText('$2,500');
    await page.keyboard.press('Control+y');
    await expect(page.getByTestId('money')).toHaveText('$2,490');
  });

  test('explains invalid placements and leaves the money untouched', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.getByRole('button', { name: /^Curve/ }).click();

    const water = await cellPoint(page, { x: 19, y: 29 });
    await page.mouse.move(water.x, water.y);
    await expect(page.getByTestId('cursor-tooltip')).toContainText('✕ Terrain not buildable');
    await page.mouse.click(water.x, water.y);
    await expect(page.getByTestId('toast')).toHaveText('✕ Terrain not buildable');
    await expect(page.getByTestId('money')).toHaveText('$2,500');
  });

  test('locked level elements cannot be erased', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.keyboard.press('Delete');
    await clickCell(page, { x: 20, y: 20 });
    await expect(page.getByTestId('toast')).toHaveText('✕ Locked level element');
  });

  test('the terrain brush paints a whole drag as one undo step', async ({ page }) => {
    await openLevel(page, 'sandbox');
    await page.getByRole('tab', { name: 'Terrain' }).click();
    await page.getByRole('button', { name: /^Snow/ }).click();

    const cells = [34, 35, 36, 37].map((x) => ({ x, y: 30 }));
    const points = await Promise.all(cells.map((c) => cellPoint(page, c)));
    const [first, ...rest] = points;
    if (!first) throw new Error('no cells');
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.mouse.up();

    const after = await readGame(page);
    expect(cells.map((c) => after.terrain[c.y * after.cols + c.x])).toEqual([
      'snow',
      'snow',
      'snow',
      'snow',
    ]);
    expect(after.undo).toBe(1);

    await page.keyboard.press('Control+z');
    const undone = await readGame(page);
    expect(cells.map((c) => undone.terrain[c.y * undone.cols + c.x])).toEqual([
      'dirt',
      'dirt',
      'dirt',
      'dirt',
    ]);
  });

  test('the terrain tab is hidden when the level locks terrain', async ({ page }) => {
    await openLevel(page, 'level-001');
    await expect(page.getByRole('tab', { name: 'Tracks' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Terrain' })).toHaveCount(0);
  });

  test('the network check reports problems', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.getByRole('button', { name: 'Check network' }).click();
    const report = page.getByTestId('network-report');
    await expect(report).toContainText('Loose ends: 4');
    await expect(report).toContainText('Isolated stations: North Mine, Power Plant');
  });

  test('the inspector describes a clicked cell', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.keyboard.press('i');
    await clickCell(page, { x: 10, y: 9 });
    const facts = page.getByTestId('inspector-cell');
    await expect(facts).toContainText('Platform track');
    await expect(facts).toContainText('North Mine');
  });
});
