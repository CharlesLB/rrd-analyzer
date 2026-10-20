import { DEFAULT_LOCALE, LOCALES, type Locale } from '../locale/locale';
import { ENGLISH_MESSAGES } from '../messages/english/english.messages';
import type { Messages } from '../messages/messages';

const CATALOGUES: Readonly<Record<Locale, Messages>> = {
  [LOCALES.ENGLISH]: ENGLISH_MESSAGES,
};

export const messagesFor = (locale: Locale = DEFAULT_LOCALE): Messages => CATALOGUES[locale];
