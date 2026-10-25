import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES } from '../locale/locale';
import { messagesFor } from './translations';

const SENTENCES_WRITTEN_WITH_DASHES = [
  'PNG render failed — export SVG instead',
  'PNG copied — paste into the postmortem',
  'copy blocked — use “PNG image” to download',
  'clipboard blocked here — downloading PNG',
  'results are stale — open the panel to re-run',
  'Stale — the window or scope changed since this run.',
  'Stale — the insight rules changed since this run.',
  'the end of reporting was inferred from missing data / a counter reset — not observed',
  'Analyzed all data — {from} to {to}',
  'Analyzed the viewport — {from} to {to}',
  'No log entries found — the file needs JSON objects.',
  'File is too large — {size}, the limit is {limit}.',
  "Required — pick the field with each entry's date and time.",
  'Required — pick the level or category field.',
  '“{field}” has {count} distinct values — that looks like an ID, not a log type.',
  '{count} entry has no type — shown as “unknown”.',
  '{count} entries have no type — shown as “unknown”.',
  'Required — pick the main message field.',
  '{count} entry has no message — shown as “(no message)”.',
  '{count} entries have no message — shown as “(no message)”.',
  "Couldn't load {file} — {reason}",
];

const stringsOf = (value: unknown): readonly string[] => {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(stringsOf);
  }

  return value !== null && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : [];
};

describe('messagesFor', () => {
  it('serves the english catalogue for the default locale', () => {
    expect(messagesFor()).toBe(messagesFor(LOCALES.ENGLISH));
    expect(messagesFor(DEFAULT_LOCALE).application.name).toBe('RRD Analyzer');
  });

  it('keeps dashes to the few sentences written with them on purpose', () => {
    const withDashes = stringsOf(messagesFor(LOCALES.ENGLISH)).filter((message) => message.includes('—') || message.includes('–'));

    expect(withDashes).toEqual(SENTENCES_WRITTEN_WITH_DASHES);
  });
});
