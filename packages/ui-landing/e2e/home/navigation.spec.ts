import { expect, test } from '@playwright/test';
import { isJustBelowTheHeader, openLanding, sectionTopOf } from '../support/visitors';

test.describe('section navigation', () => {
  test('every header link lands its section just below the sticky header', async ({ page }) => {
    await openLanding(page);

    const sections = [
      { label: 'Features', sectionId: 'features' },
      { label: 'Demo', sectionId: 'demo' },
      { label: 'Download', sectionId: 'download' },
    ];

    await sections.reduce(async (previous, { label, sectionId }) => {
      await previous;
      await page.locator('.site-header-link', { hasText: label }).click();

      await expect.poll(async () => isJustBelowTheHeader(await sectionTopOf(page, sectionId))).toBe(true);
      await expect.poll(() => new URL(page.url()).hash).toBe(`#${sectionId}`);
    }, Promise.resolve());
  });

  test('donate link scrolls to the end of the page, where the donation panel sits in full view', async ({ page }) => {
    await openLanding(page);

    await page.locator('.site-header-link', { hasText: 'Donate' }).click();

    await expect(page).toHaveURL(/#donate$/);
    await expect(page.locator('.donate-section-panel')).toBeInViewport({ ratio: 1 });
  });

  test('header stays on top of the page while it scrolls', async ({ page }) => {
    await openLanding(page);

    await page.locator('.site-header-link', { hasText: 'Download' }).click();

    await expect.poll(async () => await page.locator('.site-header').evaluate((header) => header.getBoundingClientRect().top)).toBe(0);
  });

  test('hero demo button takes the visitor to the demo', async ({ page }) => {
    await openLanding(page);

    await page.locator('.hero-demo').click();

    await expect.poll(async () => isJustBelowTheHeader(await sectionTopOf(page, 'demo'))).toBe(true);
  });

  test('page opened on a section anchor lands on that section', async ({ page }) => {
    await page.goto('/#download');

    await expect.poll(async () => isJustBelowTheHeader(await sectionTopOf(page, 'download'))).toBe(true);
  });

  test('an address that does not exist shows the landing page', async ({ page }) => {
    await page.goto('/nowhere');

    await expect(page.locator('.hero-title')).toBeVisible();
  });
});
