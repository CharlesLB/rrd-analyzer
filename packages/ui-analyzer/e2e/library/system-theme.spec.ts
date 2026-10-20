import { expect, type Page } from '@playwright/test';
import { openLibrary, resetLibrary } from '../support/analyzer';
import { test } from '../support/fixtures';

const THEME_BOOT_SCRIPT = 'theme-boot.js';

test.use({ colorScheme: 'dark' });

const bodyBackground = async (page: Page): Promise<string> => await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);

test.beforeEach(async ({ page }) => {
  await resetLibrary(page);
});

test.describe('theme of the operating system', () => {
  test('app opened on a desktop set to dark, with no theme chosen, opens in the dark theme', async ({ page }) => {
    await openLibrary(page);

    await expect(page.locator('.app-shell')).toHaveClass(/dark/);
  });

  test('app with no theme chosen follows the desktop as it switches between dark and light, the page behind it included', async ({ page }) => {
    await openLibrary(page);
    const darkBackground = await bodyBackground(page);

    await page.emulateMedia({ colorScheme: 'light' });

    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);
    await expect.poll(async () => await bodyBackground(page)).not.toBe(darkBackground);

    await page.emulateMedia({ colorScheme: 'dark' });

    await expect(page.locator('.app-shell')).toHaveClass(/dark/);
  });

  test('a chosen theme is already on the page before the app has loaded, so a launch does not flash the other one', async ({ page }) => {
    await openLibrary(page);
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/light/);
    const lightBackground = await page.locator('html').evaluate((root) => getComputedStyle(root).backgroundColor);

    await page.route('**/*.js', async (route) => {
      if (route.request().url().endsWith(THEME_BOOT_SCRIPT)) {
        await route.fallback();

        return;
      }

      await route.abort();
    });
    await page.reload();

    await expect(page.locator('html')).toHaveClass(/light/);
    expect(await page.locator('html').evaluate((root) => getComputedStyle(root).backgroundColor)).toBe(lightBackground);
  });

  test('a theme chosen with the toggle wins over the desktop, across a reload and a desktop switch', async ({ page }) => {
    await openLibrary(page);

    await page.locator('.theme-toggle').click();

    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);

    await page.reload();

    await expect(page.locator('.new-analysis-card')).toBeVisible();
    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);

    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });

    await expect(page.locator('.app-shell')).not.toHaveClass(/dark/);
  });
});
