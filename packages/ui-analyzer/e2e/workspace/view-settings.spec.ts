import { expect, type Page } from '@playwright/test';
import { canvasOf, resetLibrary, seedWorkspace } from '../support/analyzer';
import { test } from '../support/fixtures';
import { hoverChartAt } from '../support/workspace';

const FILLED_AREAS = '.library-thumbnail .sparkline path:not(.sparkline-line)[d^="M"]';

const toggleSetting = async (page: Page, label: string): Promise<void> => {
  await page.getByLabel('view settings').click();
  await page.getByRole('menuitemcheckbox', { name: label }).click();
  await page.keyboard.press('Escape');
};

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
  await seedWorkspace(page, { name: 'Settings', canvas: canvasOf('s3', 's5') });
});

test.describe('view settings', () => {
  test('both settings start on, and each is checked in the menu', async ({ page }) => {
    await page.getByLabel('view settings').click();

    await expect(page.getByRole('menuitemcheckbox', { name: 'Fill under the library sparklines' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Share the crosshair across charts' })).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Escape');

    await expect(page.getByRole('menuitemcheckbox')).toHaveCount(0);
  });

  test('the library sparklines lose their fill once it is turned off, and keep it off after a reload', async ({ page }) => {
    await expect(page.locator(FILLED_AREAS).first()).toBeAttached();

    await toggleSetting(page, 'Fill under the library sparklines');

    await expect(page.locator(FILLED_AREAS)).toHaveCount(0);

    await page.reload();

    await expect(page.locator('.library-thumbnail').first()).toBeVisible();
    await expect(page.locator(FILLED_AREAS)).toHaveCount(0);
  });

  test('a crosshair no longer shared stays on the chart under the pointer', async ({ page }) => {
    await toggleSetting(page, 'Share the crosshair across charts');

    await hoverChartAt(page, 1, 0.5);

    await expect(page.locator('.chart-crosshair-line')).toHaveCount(1);
    await expect(page.locator('.chart-panel').nth(1).locator('.chart-crosshair-line')).toHaveCount(1);
  });
});
