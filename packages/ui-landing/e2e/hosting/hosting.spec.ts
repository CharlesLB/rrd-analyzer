import { expect, test } from '@playwright/test';

const NO_REDIRECT = { maxRedirects: 0 };
const MOVED_PERMANENTLY = 301;
const NOT_FOUND = 404;
const SEARCH_ROBOTS_HEADER = 'x-robots-tag';

test.describe('site served by the Worker', () => {
  test('a copy of a page answers with a permanent redirect to its one address, keeping the query', async ({ request }) => {
    const copies = [
      { copy: '/index.html', address: '/' },
      { copy: '/app', address: '/app/' },
      { copy: '/app/index.html', address: '/app/' },
      { copy: '/app?from=newsletter', address: '/app/?from=newsletter' },
    ];

    const answers = await Promise.all(
      copies.map(async ({ copy }) => {
        const response = await request.get(copy, NO_REDIRECT);

        return { status: response.status(), location: response.headers()['location'] };
      }),
    );

    expect(answers).toEqual(copies.map(({ address }) => ({ status: MOVED_PERMANENTLY, location: address })));
  });

  test('an address that does not exist answers 404 with the not-found page, at any depth', async ({ request }) => {
    const responses = await Promise.all(['/nowhere', '/nowhere/at/all', '/app/nowhere'].map(async (address) => await request.get(address, NO_REDIRECT)));

    expect(responses.map((response) => response.status())).toEqual([NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    expect(await responses[0]?.text()).toContain('This page does not exist.');
  });

  test('the application stays out of search results, and the landing page does not', async ({ request }) => {
    const [landing, application] = await Promise.all([request.get('/'), request.get('/app/')]);

    expect(landing.headers()[SEARCH_ROBOTS_HEADER]).toBeUndefined();
    expect(application.headers()[SEARCH_ROBOTS_HEADER]).toBe('noindex');
  });
});
