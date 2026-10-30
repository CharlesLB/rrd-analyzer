import { expect, test } from '@playwright/test';
import { openLanding } from '../support/visitors';

test.describe('page without scripts', () => {
  test.use({ javaScriptEnabled: false });

  test('a crawler that runs no script still reads the whole page, titled and described', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('RRD Analyzer: free RRD file viewer for rrdtool metrics');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /rrdtool \.rrd files/);
    await expect(page.locator('h1')).toHaveText('See what your servers were doing, minute by minute.');
    await expect(page.locator('main section[id]')).toHaveCount(4);
    await expect(page.locator('.platform-card-name')).toHaveText(['Windows', 'Linux', 'macOS']);
  });

  test('a crawler that runs no script finds one canonical address, a link preview and the structured data', async ({ page, baseURL }) => {
    await page.goto('/?utm_source=newsletter');

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index, follow/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${baseURL}/screenshots/workspace.jpg`);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    expect(JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '')).toMatchObject({
      '@graph': [{ '@type': 'WebSite' }, { '@type': 'SoftwareApplication', operatingSystem: 'Windows, Linux' }],
    });
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
