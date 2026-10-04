import { expect, test, type Download, type Page } from '@playwright/test';

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
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

function trackCount(page: Page) {
  return page.evaluate(() => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    return session?.status === 'ready' ? session.game.world.tracks.length : -1;
  });
}

/**
 * Clicks "Download game" and returns the downloaded file name and contents. The contents are
 * captured from the Blob inside the page, so the test does not depend on the download folder.
 */
async function downloadGame(page: Page): Promise<{ fileName: string; text: string }> {
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    const win = window as unknown as { __lastBlob?: Promise<string> };
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      if (blob instanceof Blob) win.__lastBlob = blob.text();
      return original(blob);
    };
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download game' }).click();
  const download: Download = await downloadPromise;
  const text = await page.evaluate(
    () => (window as unknown as { __lastBlob?: Promise<string> }).__lastBlob ?? '',
  );
  return { fileName: download.suggestedFilename(), text };
}

/** A save file the import input can receive. */
function saveFile(text: string) {
  return { name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(text) };
}

async function placeStraight(page: Page, cell: Cell) {
  await page.getByRole('button', { name: /^Straight/ }).click();
  await clickCell(page, cell);
}

test.describe('Persistence', () => {
  test('autosaves edits and restores them after a reload', async ({ page }) => {
    await openLevel(page, 'level-001');
    await placeStraight(page, { x: 28, y: 25 });
    await expect(page.getByTestId('save-status')).toContainText('Saved ✓');

    await page.reload();
    await waitForScene(page);
    await expect(page.getByTestId('money')).toHaveText('$2,490');
    expect(await trackCount(page)).toBe(7);
  });

  test('a corrupted save is backed up and the level starts from scratch', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.evaluate(() => {
      localStorage.setItem('traincity:v1:save:level-001', '{broken');
    });
    await page.reload();
    await waitForScene(page);
    await expect(page.getByTestId('toast')).toContainText('Saved game is corrupted');
    await expect(page.getByTestId('money')).toHaveText('$2,500');
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some((k) => k.startsWith('traincity:v1:save:level-001:corrupt:'))).toBe(true);
    expect(keys).not.toContain('traincity:v1:save:level-001');
  });

  test('download, restart and import bring the game back', async ({ page }) => {
    await openLevel(page, 'level-001');
    await placeStraight(page, { x: 28, y: 25 });
    await expect(page.getByTestId('money')).toHaveText('$2,490');

    const { fileName, text } = await downloadGame(page);
    expect(fileName).toMatch(/^traincity-level-001-\d{8}-\d{4}\.json$/);
    const saved = JSON.parse(text) as { format: string; levelId: string };
    expect(saved).toMatchObject({ format: 'traincity-save', levelId: 'level-001' });

    await page.getByRole('button', { name: 'Restart level' }).click();
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await waitForScene(page);
    await expect(page.getByTestId('money')).toHaveText('$2,500');
    expect(await trackCount(page)).toBe(6);
    expect(
      await page.evaluate(() => localStorage.getItem('traincity:v1:save:level-001')),
    ).toBeNull();

    await page.getByTestId('import-input').setInputFiles(saveFile(text));
    await expect(page.getByTestId('toast')).toHaveText('Game imported');
    await waitForScene(page);
    await expect(page.getByTestId('money')).toHaveText('$2,490');
    expect(await trackCount(page)).toBe(7);
  });

  test('importing a file from another level switches to it', async ({ page }) => {
    await openLevel(page, 'level-001');
    await placeStraight(page, { x: 28, y: 25 });
    const { text } = await downloadGame(page);

    await page.getByRole('combobox', { name: 'Level' }).selectOption('sandbox');
    await waitForScene(page);
    await page.getByTestId('import-input').setInputFiles(saveFile(text));
    await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('level-001');
    await expect(page.getByTestId('money')).toHaveText('$2,490');
  });

  test('an invalid file shows readable errors and changes nothing', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.getByTestId('import-input').setInputFiles({
      name: 'not-a-save.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"hello": "world"}'),
    });
    const dialog = page.getByRole('alertdialog', { name: 'Could not import this file' });
    await expect(dialog).toContainText('Not a Train City save file');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('money')).toHaveText('$2,500');
  });

  test('the grid preference survives a reload', async ({ page }) => {
    await openLevel(page, 'level-001');
    await page.getByRole('checkbox', { name: /grid/i }).uncheck();
    await page.reload();
    await waitForScene(page);
    await expect(page.getByRole('checkbox', { name: /grid/i })).not.toBeChecked();
  });
});
