import { expect, type Locator, type Page } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace } from '../support/analyzer';
import { test } from '../support/fixtures';
import { addToCanvas, boxOf, chartPanels, chartTitles } from '../support/workspace';

const RESIZE_STEPS = 10;
const PIXEL_TOLERANCE = 2;

const resizeGrip = (page: Page, chartIndex: number): Locator => page.locator('.chart-panel-resize').nth(chartIndex);

const heightOf = async (locator: Locator): Promise<number> => (await boxOf(locator)).height;

const dragGripBy = async (page: Page, chartIndex: number, verticalOffset: number): Promise<void> => {
  const grip = resizeGrip(page, chartIndex);
  await grip.hover();
  const box = await boxOf(grip);
  const centreX = box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  await page.mouse.down();
  await page.mouse.move(centreX, centreY + verticalOffset, { steps: RESIZE_STEPS });
  await page.mouse.up();
};

const expectSameHeight = async (first: Locator, second: Locator): Promise<void> => {
  await expect.poll(async () => Math.abs((await heightOf(first)) - (await heightOf(second)))).toBeLessThanOrEqual(PIXEL_TOLERANCE);
};

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('chart height', () => {
  test('a chart’s bottom edge dragged up shortens that chart, and the chart below takes the room it gave up', async ({ page }) => {
    await seedWorkspace(page, { name: 'Two charts', canvas: canvasOf('s3', 's5') });
    await expectSameHeight(chartPanels(page).first(), chartPanels(page).last());
    const sharedHeight = await heightOf(chartPanels(page).first());

    await dragGripBy(page, 0, -120);

    await expect.poll(async () => await heightOf(chartPanels(page).first())).toBeLessThan(sharedHeight - 100);
    await expect.poll(async () => await heightOf(chartPanels(page).last())).toBeGreaterThan(sharedHeight + 100);
    await expect(resizeGrip(page, 0)).toHaveAttribute('title', 'Drag to set this chart’s height, double-click to fit it again');
  });

  test('a double click on a chart’s bottom edge hands the chart back to the canvas, sharing the height again', async ({ page }) => {
    await seedWorkspace(page, { name: 'Two charts', canvas: canvasOf('s3', 's5') });
    await dragGripBy(page, 0, -120);

    await resizeGrip(page, 0).dblclick();

    await expectSameHeight(chartPanels(page).first(), chartPanels(page).last());
  });

  test('a chart dragged taller than the window makes the canvas scroll, while the chart below keeps a height of its own', async ({ page }) => {
    await seedWorkspace(page, { name: 'Two charts', canvas: canvasOf('s3', 's5') });
    await expect(page.locator('.chart-canvas')).toHaveCSS('overflow-y', 'hidden');

    await dragGripBy(page, 0, 400);

    await expect(page.locator('.chart-canvas')).toHaveCSS('overflow-y', 'auto');
    await expect.poll(async () => await heightOf(chartPanels(page).last())).toBeGreaterThan(100);
  });

  test('a chart’s height is not saved: a reload opens the canvas with every chart sharing the height', async ({ page }) => {
    await seedWorkspace(page, { name: 'Two charts', canvas: canvasOf('s3', 's5') });
    await dragGripBy(page, 0, -120);

    await page.reload();

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expectSameHeight(chartPanels(page).first(), chartPanels(page).last());
  });

  test('a chart given a height and then removed comes back sharing the height when it is added again', async ({ page }) => {
    await seedWorkspace(page, { name: 'Two charts', canvas: canvasOf('s3', 's5') });
    await dragGripBy(page, 1, -120);

    await chartPanels(page).last().locator('.chart-panel-header-remove').click();
    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user']);
    await addToCanvas(page, 'system_memory_used');

    await expect(chartTitles(page)).toHaveText(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    await expectSameHeight(chartPanels(page).first(), chartPanels(page).last());
  });
});
