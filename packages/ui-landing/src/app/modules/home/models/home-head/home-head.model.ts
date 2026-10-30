import { META_NAMES, type MetaTag, OPEN_GRAPH_PROPERTIES, ROBOTS_DIRECTIVES, type StructuredData } from '../../../../core/document-head/document-head.model';
import type { Messages } from '../../../../stores/i18n/models/messages/messages.model';
import type { PlatformDownloads } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { SCREENSHOTS } from '../screenshots/screenshots.model';

export type HomeHeadSource = {
  readonly texts: Messages;
  readonly language: string;
  readonly siteUrl: string;
  readonly version: string;
  readonly repositoryUrl: string;
  readonly releasesUrl: string;
  readonly platforms: readonly PlatformDownloads[];
};

export type HomeHead = {
  readonly metaTags: readonly MetaTag[];
  readonly canonicalUrl: string;
  readonly structuredData: StructuredData;
};

const HOME_PATH = '/';
const PREVIEW_IMAGE = SCREENSHOTS.WORKSPACE;
const OPEN_GRAPH_TYPE = 'website';
const TWITTER_CARD = 'summary_large_image';

const SCHEMA_CONTEXT = 'https://schema.org';

const SCHEMA_TYPES = {
  WEB_SITE: 'WebSite',
  SOFTWARE_APPLICATION: 'SoftwareApplication',
  OFFER: 'Offer',
} as const;

const NODE_ANCHORS = {
  WEB_SITE: '#website',
  APPLICATION: '#application',
} as const;

const APPLICATION_CATEGORY = 'DeveloperApplication';
const LICENSE_URL = 'https://opensource.org/license/mit';
const FREE_PRICE = '0';
const PRICE_CURRENCY = 'USD';
const OPERATING_SYSTEM_SEPARATOR = ', ';

const operatingSystemsOf = (platforms: readonly PlatformDownloads[], texts: Messages): string =>
  platforms
    .filter((platform) => platform.files.length > 0)
    .map((platform) => texts.download.platforms[platform.platform].name)
    .join(OPERATING_SYSTEM_SEPARATOR);

const metaTagsOf = (source: HomeHeadSource, homeUrl: string, imageUrl: string): readonly MetaTag[] => {
  const { meta, common, hero } = source.texts;

  return [
    { name: META_NAMES.DESCRIPTION, content: meta.description },
    { name: META_NAMES.ROBOTS, content: ROBOTS_DIRECTIVES.INDEX },
    { property: OPEN_GRAPH_PROPERTIES.TYPE, content: OPEN_GRAPH_TYPE },
    { property: OPEN_GRAPH_PROPERTIES.SITE_NAME, content: common.productName },
    { property: OPEN_GRAPH_PROPERTIES.LOCALE, content: meta.openGraphLocale },
    { property: OPEN_GRAPH_PROPERTIES.TITLE, content: meta.title },
    { property: OPEN_GRAPH_PROPERTIES.DESCRIPTION, content: meta.description },
    { property: OPEN_GRAPH_PROPERTIES.URL, content: homeUrl },
    { property: OPEN_GRAPH_PROPERTIES.IMAGE, content: imageUrl },
    { property: OPEN_GRAPH_PROPERTIES.IMAGE_WIDTH, content: String(PREVIEW_IMAGE.width) },
    { property: OPEN_GRAPH_PROPERTIES.IMAGE_HEIGHT, content: String(PREVIEW_IMAGE.height) },
    { property: OPEN_GRAPH_PROPERTIES.IMAGE_ALT, content: hero.lightScreenshotDescription },
    { name: META_NAMES.TWITTER_CARD, content: TWITTER_CARD },
  ];
};

const structuredDataOf = (source: HomeHeadSource, homeUrl: string, imageUrl: string): StructuredData => {
  const { meta, common } = source.texts;

  return {
    '@context': SCHEMA_CONTEXT,
    '@graph': [
      {
        '@type': SCHEMA_TYPES.WEB_SITE,
        '@id': `${homeUrl}${NODE_ANCHORS.WEB_SITE}`,
        url: homeUrl,
        name: common.productName,
        description: meta.description,
        inLanguage: source.language,
      },
      {
        '@type': SCHEMA_TYPES.SOFTWARE_APPLICATION,
        '@id': `${homeUrl}${NODE_ANCHORS.APPLICATION}`,
        url: homeUrl,
        name: common.productName,
        description: meta.description,
        image: imageUrl,
        screenshot: imageUrl,
        applicationCategory: APPLICATION_CATEGORY,
        operatingSystem: operatingSystemsOf(source.platforms, source.texts),
        softwareVersion: source.version,
        downloadUrl: source.releasesUrl,
        license: LICENSE_URL,
        isAccessibleForFree: true,
        offers: { '@type': SCHEMA_TYPES.OFFER, price: FREE_PRICE, priceCurrency: PRICE_CURRENCY },
        sameAs: [source.repositoryUrl],
      },
    ],
  };
};

export const homeHeadOf = (source: HomeHeadSource): HomeHead => {
  const homeUrl = `${source.siteUrl}${HOME_PATH}`;
  const imageUrl = `${homeUrl}${PREVIEW_IMAGE.source}`;

  return {
    metaTags: metaTagsOf(source, homeUrl, imageUrl),
    canonicalUrl: homeUrl,
    structuredData: structuredDataOf(source, homeUrl, imageUrl),
  };
};
