import { expect, test } from '@playwright/test';

test.describe('Pixel-art pass (Stage 7)', () => {
  test('loads every atlas without placeholder warnings and shows sprite icons', async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && /atlas|frame/i.test(message.text())) {
        warnings.push(message.text());
      }
    });
    await page.goto('/?level=sandbox');
    await page.waitForFunction(() => window.__TRAINCITY__?.stores.view.getState().sceneReady);

    // Palette icons are atlas frames, rendered pixelated.
    const icon = page.getByTestId('sprite-straight_0');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveCSS('image-rendering', 'pixelated');
    await page.getByRole('tab', { name: 'Objects' }).click();
    await expect(page.getByTestId('sprite-house_s_0')).toBeVisible();

    // Place a train and run it: vehicles come from the atlas too (no placeholder warnings).
    await page.evaluate(() => {
      const store = window.__TRAINCITY__?.stores.game;
      if (!store) throw new Error('no store');
      const put = (x: number, y: number) =>
        store
          .getState()
          .execute({ type: 'placeTrack', cell: { x, y }, piece: 'straight', rotation: 0 });
      for (let y = 20; y < 30; y++) put(30, y);
      store.getState().execute({
        type: 'placeTrain',
        cell: { x: 30, y: 25 },
        locomotive: 'loco_steam',
        wagons: ['wagon_hopper'],
        facing: 'N',
      });
    });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Start t1' }).click();
    await page.waitForTimeout(500);
    expect(warnings).toEqual([]);
  });

  test('headings use the pixel font', async ({ page }) => {
    await page.goto('/');
    const title = page.getByRole('heading', { name: 'Train City' });
    await expect(title).toHaveCSS('font-family', /Pixelify Sans/);
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('16px "Pixelify Sans"')))
      .toBe(true);
  });
});
