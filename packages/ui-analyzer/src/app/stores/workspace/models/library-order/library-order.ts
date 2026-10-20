import * as R from 'remeda';
import type { Series } from '../series/series.model';

export const isAtTopOfLibrary = (library: readonly Series[], seriesId: string): boolean => R.first(library)?.id === seriesId;

export const movedToTopOfLibrary = (library: readonly Series[], seriesId: string): readonly Series[] => {
  const moved = library.find((series) => series.id === seriesId);

  if (moved === undefined || isAtTopOfLibrary(library, seriesId)) {
    return library;
  }

  return [moved, ...R.filter(library, (series) => series.id !== seriesId)];
};
