import { describe, expect, it } from 'vitest';
import { ENGLISH_MESSAGES } from '../../../../stores/i18n/models/english-messages/english.messages';
import { PLATFORMS } from '../../../../stores/releases/models/platform/platform.model';
import { downloadsFor, platformReleasesOf } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { type HomeHeadSource, homeHeadOf } from './home-head.model';

const REPOSITORY_URL = 'https://github.com/CharlesLB/rrd-analyzer';

const sourceAt = (siteUrl: string): HomeHeadSource => ({
  texts: ENGLISH_MESSAGES,
  language: 'en',
  siteUrl,
  version: '1.2.3',
  repositoryUrl: REPOSITORY_URL,
  releasesUrl: `${REPOSITORY_URL}/releases`,
  platforms: downloadsFor(platformReleasesOf({ repositoryUrl: REPOSITORY_URL, version: '1.2.3' }), PLATFORMS.WINDOWS),
});

const contentOf = (siteUrl: string, key: string): string | undefined =>
  homeHeadOf(sourceAt(siteUrl)).metaTags.find((tag) => ('name' in tag ? tag.name : tag.property) === key)?.content;

const graphOf = (siteUrl: string): readonly Readonly<Record<string, unknown>>[] => {
  const graph = homeHeadOf(sourceAt(siteUrl)).structuredData['@graph'];

  return Array.isArray(graph) ? graph : [];
};

describe('homeHeadOf', () => {
  it('homeHeadOf, for a site address, makes the root of the site the one canonical address', () => {
    expect(homeHeadOf(sourceAt('https://rrd-analyzer.example.com')).canonicalUrl).toBe('https://rrd-analyzer.example.com/');
  });

  it('homeHeadOf, for a search engine, describes the page and lets it be indexed with a large image preview', () => {
    expect(contentOf('https://rrd-analyzer.example.com', 'description')).toBe(ENGLISH_MESSAGES.meta.description);
    expect(contentOf('https://rrd-analyzer.example.com', 'robots')).toBe('index, follow, max-image-preview:large');
  });

  it('homeHeadOf, for a link preview, names the page and points at an absolute screenshot with its size', () => {
    expect(contentOf('https://rrd-analyzer.example.com', 'og:title')).toBe(ENGLISH_MESSAGES.meta.title);
    expect(contentOf('https://rrd-analyzer.example.com', 'og:url')).toBe('https://rrd-analyzer.example.com/');
    expect(contentOf('https://rrd-analyzer.example.com', 'og:image')).toBe('https://rrd-analyzer.example.com/screenshots/workspace.jpg');
    expect(contentOf('https://rrd-analyzer.example.com', 'og:image:width')).toBe('924');
    expect(contentOf('https://rrd-analyzer.example.com', 'og:image:height')).toBe('540');
    expect(contentOf('https://rrd-analyzer.example.com', 'og:locale')).toBe('en_US');
    expect(contentOf('https://rrd-analyzer.example.com', 'twitter:card')).toBe('summary_large_image');
  });

  it('homeHeadOf, as structured data, names the site and describes the application, free and versioned', () => {
    const [webSite, application] = graphOf('https://rrd-analyzer.example.com');

    expect(webSite).toMatchObject({ '@type': 'WebSite', url: 'https://rrd-analyzer.example.com/', name: 'RRD Analyzer', inLanguage: 'en' });
    expect(application).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'RRD Analyzer',
      softwareVersion: '1.2.3',
      downloadUrl: `${REPOSITORY_URL}/releases`,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      sameAs: [REPOSITORY_URL],
    });
  });

  it('homeHeadOf, as structured data, lists only the systems a release has a package for', () => {
    const [, application] = graphOf('https://rrd-analyzer.example.com');

    expect(application?.['operatingSystem']).toBe('Windows, Linux');
  });
});
