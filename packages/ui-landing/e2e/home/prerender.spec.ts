import { expect, test } from '@playwright/test';
import { openLanding } from '../support/visitors';

test.describe('page without scripts', () => {
  test.use({ javaScriptEnabled: false });

  test('a crawler that runs no script still reads the whole page, titled and described', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('RRD Analyzer: read your RRD files like a timeline');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /round-robin database files/);
    await expect(page.locator('h1')).toHaveText('See what your servers were doing, minute by minute.');
    await expect(page.locator('main section[id]')).toHaveCount(4);
    await expect(page.locator('.platform-card-name')).toHaveText(['Windows', 'Linux', 'macOS']);
  });

  test('download links work with no script at all', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.hero-download')).toHaveAttribute('href', /\/releases\/download\/v/);
  });
});

test.describe('page with scripts', () => {
  test('hydrates without an error in the console', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await openLanding(page);
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
  });
});
