export const LOCALES = {
  ENGLISH: 'en',
} as const;

export type Locale = (typeof LOCALES)[keyof typeof LOCALES];

export const DEFAULT_LOCALE: Locale = LOCALES.ENGLISH;
