import { expect, test } from '@playwright/test';

test.describe('files a crawler reads, written with the address the site was built for', () => {
  test('robots.txt lets the whole site be crawled but the API, and points at the sitemap', async ({ request, baseURL }) => {
    const robots = await (await request.get('/robots.txt')).text();

    expect(robots).toContain('Allow: /\n');
    expect(robots).toContain('Disallow: /api/\n');
    expect(robots).toContain(`Sitemap: ${baseURL}/sitemap.xml`);
  });

  test('the sitemap lists the landing page, and only it', async ({ request, baseURL }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();

    expect(sitemap.match(/<loc>[^<]*<\/loc>/g)).toEqual([`<loc>${baseURL}/</loc>`]);
  });

  test('the not-found page is built as 404.html, for the host to answer unknown addresses with', async ({ page }) => {
    await page.goto('/404.html');

    await expect(page).toHaveTitle('Page not found · RRD Analyzer');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });
});
