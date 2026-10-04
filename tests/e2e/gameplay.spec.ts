import { expect, test, type Page } from '@playwright/test';

type Cell = { x: number; y: number };

async function openLevel(page: Page, levelId: string) {
  await page.goto(`/?level=${levelId}`);
  await waitForScene(page);
}

async function waitForScene(page: Page) {
  await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);
}

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

/** Lays the reference track of level-001 through the dev-only hook (57 pieces). */
async function buildLevel001Track(page: Page) {
  const placed = await page.evaluate(() => {
    const store = window.__TRAINCITY__?.stores.game;
    if (!store) throw new Error('no store');
    const put = (x: number, y: number, piece: string, rotation: number) =>
      store.getState().execute({ type: 'placeTrack', cell: { x, y }, piece, rotation }).ok;
    let ok = 0;
    for (let y = 11; y <= 37; y++) ok += Number(put(10, y, 'straight', 0));
    ok += Number(put(10, 38, 'curve', 270));
    for (let x = 11; x <= 39; x++) ok += Number(put(x, 38, 'straight', 90));
    return ok;
  });
  expect(placed).toBe(57);
}

test.describe('Gameplay (MVP)', () => {
  test('complete level-001 from the UI, then move on to the next level', async ({ page }) => {
    await openLevel(page, 'level-001');
    await expect(page.getByTestId('objective-o1')).toHaveText('0/50');
    await buildLevel001Track(page);

    // Buy a steam train with two hoppers, facing south, on the mine's last platform cell.
    await page.getByRole('tab', { name: 'Trains' }).click();
    await page.getByRole('button', { name: 'Add Hopper' }).click();
    await page.getByRole('button', { name: 'Add Hopper' }).click();
    await expect(page.getByTestId('train-price')).toHaveText('$440 + fuel $250 = $690');
    await page.getByRole('button', { name: 'Place train' }).click();
    await page.keyboard.press('r');
    await page.keyboard.press('r');
    await clickCell(page, { x: 10, y: 10 });
    await expect(page.getByTestId('money')).toHaveText('$1,218');

    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: '×4' }).click();
    await page.getByRole('button', { name: 'Start t1' }).click();

    const result = page.getByRole('dialog', { name: 'Level complete!' });
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('result-stars')).toHaveText('★★★');
    await expect(page.getByTestId('result-score')).toHaveText('$218');
    await expect(page.getByTestId('objective-o1')).toHaveText('50/50');

    await page.getByRole('button', { name: 'Next level' }).click();
    await waitForScene(page);
    await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('level-002');
    await expect(page.getByRole('option', { name: /First Run/ })).toHaveText('First Run ★★★');

    // Progress survives a reload, and level-002 stays unlocked.
    await page.reload();
    await waitForScene(page);
    await expect(page.getByRole('option', { name: /First Run/ })).toHaveText('First Run ★★★');
    // Native <option> state is read from the attribute (role queries ignore it).
    await expect(page.locator('option[value="level-002"]')).not.toHaveAttribute('disabled');
    await expect(page.locator('option[value="level-003"]')).toHaveAttribute('disabled');
  });

  test('a lost level can only be restarted', async ({ page }) => {
    await openLevel(page, 'level-001');
    // Start the level with too little money to ever buy a train.
    await page.evaluate(async () => {
      const store = window.__TRAINCITY__?.stores.game;
      const session = store?.getState().session;
      if (!store || session?.status !== 'ready') throw new Error('not ready');
      await store
        .getState()
        .loadLevel('level-001', { game: { ...session.game, initialMoney: 100 } });
    });
    await waitForScene(page);
    await page.getByRole('button', { name: 'Run', exact: true }).click();

    const dialog = page.getByRole('alertdialog', { name: 'Level failed' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('failure-reason')).toHaveText('No trains and not enough money.');
    await expect(dialog.getByRole('button')).toHaveText(['Restart level']);

    await dialog.getByRole('button', { name: 'Restart level' }).click();
    await waitForScene(page);
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('money')).toHaveText('$2,500');
    await expect(page.getByRole('button', { name: 'Editor', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('stations show their stock and trains show their cargo', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.keyboard.press('i');
    await clickCell(page, { x: 10, y: 9 });
    await expect(page.getByTestId('supply-coal')).toHaveText('50/100 coal (+10/min)');
  });
});
