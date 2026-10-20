import { expect, type Page, test } from '@playwright/test';
import { openLanding } from '../support/visitors';

const THEME_BOOT_SCRIPT = 'theme-boot.js';

const pageBackground = async (page: Page): Promise<string> => await page.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);

const visibleHeroScreenshot = async (page: Page): Promise<string | null> => await page.locator('.hero-screenshot-image:visible').getAttribute('src');

test.describe('theme of a visitor whose system is dark', () => {
  test.use({ colorScheme: 'dark' });

  test('page opens dark, with the dark screenshot', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await visibleHeroScreenshot(page)).toBe('screenshots/workspace-dark.jpg');
  });
});

test.describe('theme of a visitor whose system is light', () => {
  test.use({ colorScheme: 'light' });

  test('footer toggle switches the page and the hero screenshot to the other theme', async ({ page }) => {
    await openLanding(page);
    const lightBackground = await pageBackground(page);

    await page.locator('.site-footer-theme').click();

    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await pageBackground(page)).not.toBe(lightBackground);
    expect(await visibleHeroScreenshot(page)).toBe('screenshots/workspace-dark.jpg');
  });

  test('a chosen theme is on the page before the app has loaded, so a visit does not flash the other one', async ({ page }) => {
    await openLanding(page);
    await page.locator('.site-footer-theme').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    const darkBackground = await pageBackground(page);

    await page.route('**/*.js', async (route) => {
      if (route.request().url().endsWith(THEME_BOOT_SCRIPT)) {
        await route.fallback();

        return;
      }

      await route.abort();
    });
    await page.reload();

    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(await pageBackground(page)).toBe(darkBackground);
  });
});
