import { expect, test, type Page } from '@playwright/test';

type Cell = { x: number; y: number };

async function openLevel(page: Page, levelId: string) {
  await page.goto(`/?level=${levelId}`);
  await waitForScene(page);
  // At 0.5× the whole sandbox (1600×1200) fits in the canvas, so every cell is clickable.
  if (levelId === 'sandbox') await page.getByRole('button', { name: 'Zoom out' }).click();
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
  // Make sure the game sees the pointer on the intended cell before clicking.
  await expect(page.getByTestId('hover-cell')).toHaveText(`Cell: ${cell.x}, ${cell.y}`);
  await page.mouse.click(box.x + p.x, box.y + p.y);
}

function trains(page: Page) {
  return page.evaluate(() => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    if (session?.status !== 'ready') return [];
    return session.game.trains.map((t) => ({
      id: t.id,
      head: t.head.cell,
      status: t.status,
      running: t.running,
    }));
  });
}

function gameInfo(page: Page) {
  return page.evaluate(() => {
    const session = window.__TRAINCITY__?.stores.game.getState().session;
    if (session?.status !== 'ready') throw new Error('not ready');
    const { mode, paused, elapsedTicks } = session.game;
    return { mode, paused, elapsedTicks };
  });
}

/** Buys a train from the palette and places it on a track cell. */
async function buyTrain(page: Page, cell: Cell) {
  await page.getByRole('tab', { name: 'Trains' }).click();
  await page.getByRole('button', { name: 'Place train' }).click();
  await clickCell(page, cell);
}

test.describe('Simulation', () => {
  test('a bought train runs to the end of the track and stops', async ({ page }) => {
    await openLevel(page, 'level-001');
    await buyTrain(page, { x: 10, y: 9 }); // North Mine platform, facing north
    // Steam locomotive $300 + 500 fuel × $0.5
    await expect(page.getByTestId('money')).toHaveText('$1,950');
    expect(await trains(page)).toEqual([
      { id: 't1', head: { x: 10, y: 9 }, status: 'stopped', running: false },
    ]);

    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Start t1' }).click();
    await expect(page.getByTestId('toast')).toContainText('stopped: the track ends here', {
      timeout: 10_000,
    });
    expect(await trains(page)).toEqual([
      { id: 't1', head: { x: 10, y: 8 }, status: 'blocked', running: true },
    ]);
  });

  test('Editor Mode pauses the clock and keeps the trains where they are', async ({ page }) => {
    await openLevel(page, 'sandbox');
    await buyTrain(page, { x: 50, y: 8 });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Start t1' }).click();
    await expect.poll(async () => (await gameInfo(page)).elapsedTicks).toBeGreaterThan(20);

    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    const frozen = await gameInfo(page);
    const position = await trains(page);
    await page.waitForTimeout(500);
    expect(await gameInfo(page)).toEqual({ ...frozen, mode: 'editing' });
    expect(await trains(page)).toEqual(position);
    // The palette is back and Undo was cleared when the run started.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect
      .poll(async () => (await gameInfo(page)).elapsedTicks)
      .toBeGreaterThan(frozen.elapsedTicks);
  });

  test('clicking a switch in Run Mode flips it, unless a train is on it', async ({ page }) => {
    await openLevel(page, 'sandbox');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const switchState = () =>
      page.evaluate(() => {
        const session = window.__TRAINCITY__?.stores.game.getState().session;
        if (session?.status !== 'ready') return -1;
        return session.game.world.tracks.find((t) => t.at.x === 56 && t.at.y === 11)?.state;
      });
    expect(await switchState()).toBe(1);
    await clickCell(page, { x: 56, y: 11 });
    await expect.poll(switchState).toBe(0);

    // Park a train on the switch, then try again.
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    await buyTrain(page, { x: 56, y: 11 });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await clickCell(page, { x: 57, y: 10 }); // empty cell: nothing happens
    await page.getByRole('button', { name: 'Pause' }).click();
    await clickCell(page, { x: 56, y: 11 });
    await expect(page.getByTestId('train-panel')).toBeVisible(); // a click on a train selects it
    const flipped = await page.evaluate(() =>
      window.__TRAINCITY__?.stores.game.getState().flipSwitch({ x: 56, y: 11 }),
    );
    expect(flipped).toEqual({ ok: false, reason: 'Switch occupied' });
  });

  test('a running game is saved and reopens paused, in the same place', async ({ page }) => {
    await openLevel(page, 'sandbox');
    await buyTrain(page, { x: 50, y: 8 });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByRole('button', { name: 'Start t1' }).click();
    await expect.poll(async () => (await gameInfo(page)).elapsedTicks).toBeGreaterThan(10);
    await page.keyboard.press('p'); // pause: saves immediately
    await expect(page.getByTestId('save-status')).toContainText('Saved ✓');
    const before = await trains(page);
    const { elapsedTicks } = await gameInfo(page);

    await page.reload();
    await waitForScene(page);
    expect(await gameInfo(page)).toEqual({ mode: 'running', paused: true, elapsedTicks });
    expect(await trains(page)).toEqual(before);
    await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
  });

  test('stepping the paused simulation is deterministic', async ({ page }) => {
    await openLevel(page, 'sandbox');
    await buyTrain(page, { x: 50, y: 8 });
    const runOnce = () =>
      page.evaluate(() => {
        const store = window.__TRAINCITY__?.stores.game;
        if (!store) throw new Error('no store');
        const s = store.getState();
        s.restart();
        s.execute({
          type: 'placeTrain',
          cell: { x: 50, y: 8 },
          locomotive: 'loco_diesel',
          wagons: ['wagon_pax'],
          facing: 'N',
        });
        s.startRun();
        s.setTrainRunning('t1', true);
        store.getState().tick(600);
        s.setPaused(true);
        const session = store.getState().session;
        return session.status === 'ready' ? JSON.stringify(session.game.trains) : '';
      });
    expect(await runOnce()).toBe(await runOnce());
  });
});
