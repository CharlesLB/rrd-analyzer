import { expect, test } from '@playwright/test';
import { isJustBelowTheHeader, openLanding, PHONE_VIEWPORT, sectionTopOf, USER_AGENTS } from '../support/visitors';

const MINIMUM_TAP_TARGET = 44;

test.use({ viewport: PHONE_VIEWPORT, userAgent: USER_AGENTS.IPHONE });

test.describe('landing on a phone', () => {
  test('section links fold into a menu button', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('.site-header-links')).toBeHidden();
    await expect(page.locator('.site-header-github')).toBeHidden();
    await expect(page.locator('.site-header-menu-button')).toBeVisible();
  });

  test('menu lists the sections and the download, and closes on the section it leads to', async ({ page }) => {
    await openLanding(page);

    await page.locator('.site-header-menu-button').click();

    const menu = page.locator('.site-header-menu');

    await expect(menu.locator('.site-header-menu-link')).toHaveText(['Features', 'Demo', 'Download', 'Donate', /GitHub/]);
    await expect(menu.locator('.site-header-menu-download')).toBeVisible();

    await menu.locator('.site-header-menu-link', { hasText: 'Download' }).click();

    await expect(menu).toHaveCount(0);
    await expect.poll(async () => isJustBelowTheHeader(await sectionTopOf(page, 'download'))).toBe(true);
  });

  test('open menu lies over the page instead of pushing it down, so closing it moves nothing', async ({ page }) => {
    await openLanding(page);
    const titleTop = async (): Promise<number> => await page.locator('.hero-title').evaluate((title) => title.getBoundingClientRect().top);
    const closedTop = await titleTop();

    await page.locator('.site-header-menu-button').click();
    await expect(page.locator('.site-header-menu')).toBeVisible();

    expect(await titleTop()).toBe(closedTop);
  });

  test('demo shows a bigger screen notice instead of the poster, and still opens the app on request', async ({ page }) => {
    await openLanding(page);

    await expect(page.locator('.demo-section-poster')).toBeHidden();
    await expect(page.locator('.demo-section-notice-title')).toHaveText('Best on a bigger screen');
    await expect(page.locator('.demo-section-notice-open')).toHaveAttribute('href', 'app/');
  });

  test('every button and link a thumb is meant to hit is at least 44 pixels tall', async ({ page }) => {
    await openLanding(page);
    await page.locator('.site-header-menu-button').click();

    const heights = await page
      .locator(
        '.site-header-menu-button, .site-header-menu-download, .hero-download, .hero-demo, .platform-card-file, .demo-section-notice-open, .site-footer-theme',
      )
      .evaluateAll((targets) => targets.map((target) => target.getBoundingClientRect().height));

    expect(heights.every((height) => height >= MINIMUM_TAP_TARGET)).toBe(true);
  });

  test('page never scrolls sideways', async ({ page }) => {
    await openLanding(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    expect(overflow).toBe(0);
  });
});
