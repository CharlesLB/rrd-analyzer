export type MetaTag = { readonly name: string; readonly content: string } | { readonly property: string; readonly content: string };

export type StructuredData = Readonly<Record<string, unknown>>;

export const META_NAMES = {
  DESCRIPTION: 'description',
  ROBOTS: 'robots',
  TWITTER_CARD: 'twitter:card',
} as const;

export const OPEN_GRAPH_PROPERTIES = {
  TYPE: 'og:type',
  SITE_NAME: 'og:site_name',
  LOCALE: 'og:locale',
  TITLE: 'og:title',
  DESCRIPTION: 'og:description',
  URL: 'og:url',
  IMAGE: 'og:image',
  IMAGE_WIDTH: 'og:image:width',
  IMAGE_HEIGHT: 'og:image:height',
  IMAGE_ALT: 'og:image:alt',
} as const;

export const ROBOTS_DIRECTIVES = {
  INDEX: 'index, follow, max-image-preview:large',
  NO_INDEX: 'noindex',
} as const;
