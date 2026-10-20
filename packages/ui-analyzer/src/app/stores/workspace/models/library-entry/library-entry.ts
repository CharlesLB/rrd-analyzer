import * as R from 'remeda';
import type { LibraryEntry } from '../series/series.model';

const entriesBySeriesIdOf = (entries: readonly LibraryEntry[]): ReadonlyMap<string, LibraryEntry> =>
  new Map(R.map(entries, (entry) => [entry.series.id, entry] as const));

export const withUnchangedEntriesKept = (entries: readonly LibraryEntry[], previous: readonly LibraryEntry[]): readonly LibraryEntry[] => {
  const previousBySeriesId = entriesBySeriesIdOf(previous);

  const kept = R.map(entries, (entry) => {
    const held = previousBySeriesId.get(entry.series.id);

    return held !== undefined && R.isShallowEqual(held, entry) ? held : entry;
  });

  return kept.length === previous.length && kept.every((entry, position) => entry === previous[position]) ? previous : kept;
};
