import { expect, test, type Page } from '@playwright/test';

type Cell = { x: number; y: number };

async function clickCell(page: Page, cell: Cell) {
  const box = await page.locator('[data-testid="game-canvas"] canvas').boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const p = await page.evaluate((c) => {
    const probe = window.__TRAINCITY__?.cellToCanvas;
    if (!probe) throw new Error('cellToCanvas probe missing');
    return probe(c);
  }, cell);
  await page.mouse.move(box.x + p.x, box.y + p.y);
  await expect(page.getByTestId('hover-cell')).toHaveText(`Cell: ${cell.x}, ${cell.y}`);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

const trackAt = (page: Page, cell: Cell) =>
  page.evaluate((c) => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    if (session?.status !== 'ready') return null;
    const track = session.game.world.tracks.find((t) => t.at.x === c.x && t.at.y === c.y);
    return track ? { piece: track.piece, rotation: track.rotation } : null;
  }, cell);

test.describe('Diagonals (Stage 8)', () => {
  test('R turns a straight 45° and a 90° curve 90°', async ({ page }) => {
    await page.goto('/?level=sandbox');
    await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);

    await page.getByRole('button', { name: /^Straight/ }).click();
    await page.keyboard.press('r');
    await expect(page.getByTestId('sprite-straight_0_d')).toBeVisible(); // palette icon
    await clickCell(page, { x: 30, y: 20 });
    await expect
      .poll(() => trackAt(page, { x: 30, y: 20 }))
      .toEqual({
        piece: 'straight',
        rotation: 45,
      });

    await page
      .getByRole('button', { name: /^Curve/ })
      .first()
      .click();
    await page.keyboard.press('r');
    await clickCell(page, { x: 32, y: 20 });
    await expect
      .poll(() => trackAt(page, { x: 32, y: 20 }))
      .toEqual({
        piece: 'curve',
        rotation: 90,
      });

    // At 90° the 45° curve shows its upright frame; one more R (45° step) shows the diagonal one.
    await page.getByRole('button', { name: /45° curve/ }).click();
    await expect(page.getByTestId('sprite-curve45_0')).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.getByTestId('sprite-curve45_0_d')).toBeVisible();
  });
});
