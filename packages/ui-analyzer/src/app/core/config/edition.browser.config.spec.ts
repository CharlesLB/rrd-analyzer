import { describe, expect, it } from 'vitest';
import { EDITION } from './edition.browser.config';

describe('browser edition', () => {
  it('the browser edition runs the analyzer in the page and points to the downloads of the landing page for the offline app', () => {
    expect(EDITION).toEqual({ runsInTheBrowser: true, offlineDownloadUrl: '/#download' });
  });
});
