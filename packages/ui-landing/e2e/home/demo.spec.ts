import { expect, type Request, test } from '@playwright/test';
import { openLanding } from '../support/visitors';

const isFromThisSite = (request: Request): boolean => new URL(request.url()).hostname === '127.0.0.1';

test.describe('live demo', () => {
  test('page asks nothing of another site, and loads none of the app, until the visitor opens it', async ({ page }) => {
    const requests: Request[] = [];
    page.on('request', (request) => requests.push(request));

    await openLanding(page);
    await page.locator('#demo').scrollIntoViewIfNeeded();
    await page.waitForLoadState('networkidle');

    expect(requests.filter((request) => !isFromThisSite(request)).map((request) => request.url())).toEqual([]);
    expect(requests.some((request) => new URL(request.url()).pathname.startsWith('/app/'))).toBe(false);
  });

  test('demo opens the app that runs in the browser, in this same tab', async ({ page }) => {
    await openLanding(page);

    const poster = page.locator('.demo-section-poster');

    await expect(poster).toHaveAttribute('href', 'app/');
    await expect(poster).not.toHaveAttribute('target', /.+/);
    await expect(poster).toContainText('Open RRD Analyzer in your browser');
  });

  test('demo says, before the visitor opens it, that nothing is uploaded or kept and that the tab forgets everything', async ({ page }) => {
    await openLanding(page);

    const privacy = page.locator('.demo-section-privacy');

    await expect(privacy).toContainText('Nothing is uploaded, and nothing is saved on our servers.');
    await expect(privacy).toContainText('erased as soon as you close or reload it');
    await expect(privacy).toContainText('The desktop app works 100% offline');
  });

  test('offline app link of the demo lands on the downloads', async ({ page }) => {
    await openLanding(page);

    await page.locator('.demo-section-offline').click();

    await expect(page).toHaveURL(/#download$/);
  });
});
