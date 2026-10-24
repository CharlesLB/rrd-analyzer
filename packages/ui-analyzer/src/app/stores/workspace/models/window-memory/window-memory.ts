import * as R from 'remeda';
import { type RecentRecord, rememberedIn } from '../../../../shared/utils/recent-record/recent-record.util';
import type { ChartData } from '../series/series.model';

const KEY_SEPARATOR = '|';
const REMEMBERED_WINDOWS = 8;

export type WindowMemory<TValue> = RecentRecord<TValue>;

type WindowKeyParts = {
  readonly analysisId: string;
  readonly fromMilliseconds: number;
  readonly untilMilliseconds: number;
  readonly columns: number;
};

export const windowKeyOf = (window: WindowKeyParts): string =>
  [window.analysisId, window.fromMilliseconds, window.untilMilliseconds, window.columns].join(KEY_SEPARATOR);

type SeriesWindowKeyParts = WindowKeyParts & {
  readonly seriesIds: readonly string[];
};

export const seriesWindowKeyOf = (window: SeriesWindowKeyParts): string => [windowKeyOf(window), ...window.seriesIds].join(KEY_SEPARATOR);

export const rememberedWindow = <TValue>(memory: WindowMemory<TValue>, key: string, value: TValue): WindowMemory<TValue> =>
  rememberedIn(memory, key, value, REMEMBERED_WINDOWS);

export const seriesMissingFrom = (held: ChartData, seriesIds: readonly string[]): readonly string[] =>
  R.filter(seriesIds, (seriesId) => !Object.hasOwn(held.tracks, seriesId));

export const mergedChartData = (held: ChartData, fetched: ChartData): ChartData => ({
  tracks: { ...held.tracks, ...fetched.tracks },
  statistics: { ...held.statistics, ...fetched.statistics },
});
