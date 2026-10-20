import { sampleExtentOf, scaledY, type VerticalBand } from '../../../../shared/utils/plot-scale/plot-scale.util';
import { areaUnderPolylineOf, evenlySpacedPositionOf, gappedPolylineOf } from '../../../../shared/utils/svg-path/svg-path.util';
import type { SeriesSample } from '../../../../stores/workspace/models/series/series.model';

const THUMBNAIL_WIDTH = 100;
const THUMBNAIL_HEIGHT = 30;
const THUMBNAIL_TOP = 2;
const THUMBNAIL_DRAWABLE_HEIGHT = 26;
const THUMBNAIL_BASELINE = 29;
const THUMBNAIL_HEADROOM = 1.05;
const SMALLEST_MAXIMUM = 1e-9;
const FALLBACK_MAXIMUM = 1;
const NO_FILL = 'none';
const AREA_FILL_SHARE = '14%';
const THUMBNAIL_BAND: VerticalBand = { top: THUMBNAIL_TOP, height: THUMBNAIL_DRAWABLE_HEIGHT };

export const SPARKLINE_VIEW_BOX = `0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}`;

export type ThumbnailPaths = {
  readonly line: string;
  readonly area: string;
};

export type ThumbnailArt = ThumbnailPaths & {
  readonly areaFill: string;
};

type ThumbnailScale = {
  readonly xAt: (index: number) => number;
  readonly yOf: (value: number) => number;
};

const scaleOf = (samples: readonly SeriesSample[]): ThumbnailScale => {
  const extent = sampleExtentOf(samples);

  const range = {
    lowest: Math.min(0, extent?.lowest ?? 0) * THUMBNAIL_HEADROOM,
    highest: Math.max(SMALLEST_MAXIMUM, extent?.highest ?? FALLBACK_MAXIMUM) * THUMBNAIL_HEADROOM,
  };

  return {
    xAt: (index) => evenlySpacedPositionOf(index, samples.length, THUMBNAIL_WIDTH),
    yOf: (value) => scaledY(value, range, THUMBNAIL_BAND),
  };
};

const lineOf = (samples: readonly SeriesSample[], scale: ThumbnailScale): string =>
  gappedPolylineOf(samples, (value, index) => ({ x: scale.xAt(index), y: scale.yOf(value) }));

const areaOf = (samples: readonly SeriesSample[], scale: ThumbnailScale): string =>
  areaUnderPolylineOf(samples, THUMBNAIL_BASELINE, (value, index) => ({ x: scale.xAt(index), y: scale.yOf(value) }));

export const thumbnailPathsOf = (samples: readonly SeriesSample[]): ThumbnailPaths => {
  const scale = scaleOf(samples);

  return { line: lineOf(samples, scale), area: areaOf(samples, scale) };
};

export const thumbnailArtOf = (samples: readonly SeriesSample[], color: string, showsAreaFill: boolean): ThumbnailArt => {
  const scale = scaleOf(samples);
  const line = lineOf(samples, scale);

  return showsAreaFill
    ? { line, area: areaOf(samples, scale), areaFill: `color-mix(in srgb,${color} ${AREA_FILL_SHARE},transparent)` }
    : { line, area: '', areaFill: NO_FILL };
};
