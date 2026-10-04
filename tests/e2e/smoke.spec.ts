import { expect, test } from '@playwright/test';

test.describe('Stage 0 smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="game-canvas"] canvas')).toBeVisible();
    await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);
  });

  test('renders the canvas and the shell', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Train City' })).toBeVisible();
    await expect(page.getByTestId('zoom-level')).toHaveText('Zoom 1×');
  });

  test('mouse wheel zooms in discrete steps', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-canvas"] canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    await page.mouse.wheel(0, -100);
    await expect(page.getByTestId('zoom-level')).toHaveText('Zoom 2×');

    await page.mouse.wheel(0, 100);
    await page.mouse.wheel(0, 100);
    await expect(page.getByTestId('zoom-level')).toHaveText('Zoom 0.5×');
  });

  test('zoom buttons drive the camera through the store', async ({ page }) => {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByTestId('zoom-level')).toHaveText('Zoom 2×');
    const zoom = await page.evaluate(() => window.__TRAINCITY__?.stores.view.getState().zoom);
    expect(zoom).toBe(2);
  });

  test('hovering the map shows the cell under the pointer', async ({ page }) => {
    const canvas = page.locator('[data-testid="game-canvas"] canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // The camera starts centered on the 1000x1000 map, so the center cell is (25, 25) or a neighbor.
    await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: 2[45], 2[45]/);
  });

  test('the view stays centered when the window is resized', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 500 });
    const canvas = page.locator('[data-testid="game-canvas"] canvas');
    await expect(async () => {
      const box = await canvas.boundingBox();
      if (!box) throw new Error('canvas has no bounding box');
      expect(box.height).toBeLessThan(500);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: 2[45], 2[45]/, {
        timeout: 500,
      });
    }).toPass();
  });

  test('a small map is centered in a large viewport', async ({ page }) => {
    // At 0.5x the 1000px map is 500px wide, narrower than the canvas: it must be centered.
    await page.getByRole('button', { name: 'Zoom out' }).click();
    const canvas = page.locator('[data-testid="game-canvas"] canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: 2[45], 2[45]/);
    await page.mouse.move(box.x + 50, box.y + box.height / 2);
    await expect(page.getByTestId('hover-cell')).toHaveText('Cell: —');
  });

  test('middle-button drag pans the camera', async ({ page }) => {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click(); // 3x
    const canvas = page.locator('[data-testid="game-canvas"] canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: 2[45], 2[45]/);

    // Drag the world 120 screen px to the left: at 3x that is 40 world px = 2 cells.
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx - 120, cy, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    await page.mouse.move(cx, cy + 1);
    await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: 2[67], 2[45]/);
  });

  test('level-001 is loaded by default and the picker switches levels', async ({ page }) => {
    const picker = page.getByRole('combobox', { name: 'Level' });
    await expect(picker).toHaveValue('level-001');
    await expect(page.getByTestId('level-description')).toContainText('Haul 50 t of coal');

    await picker.selectOption('sandbox');
    await expect(page.getByTestId('level-description')).toContainText('Build freely');
    await expect(page).toHaveURL(/level=sandbox/);
    await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);

    // The sandbox is 1600x1200 (80x60 cells): the viewport center is around cell (40, 30).
    const box = await page.locator('[data-testid="game-canvas"] canvas').boundingBox();
    if (!box) throw new Error('canvas has no bounding box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('hover-cell')).toHaveText(/Cell: (39|40), (29|30)/);
    expect(await page.locator('[data-testid="game-canvas"] canvas').count()).toBe(1);
  });

  test('the level can be chosen from the URL', async ({ page }) => {
    await page.goto('/?level=sandbox');
    await expect(page.getByRole('combobox', { name: 'Level' })).toHaveValue('sandbox');
  });

  test('an unknown level shows a readable error', async ({ page }) => {
    await page.goto('/?level=nope');
    await expect(page.getByRole('alert')).toContainText('unknown level "nope"');
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    await page.reload();
    await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);
    expect(errors).toEqual([]);
  });
});
