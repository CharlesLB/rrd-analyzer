import * as R from 'remeda';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { colorOfType, severityRankOf, type TypeColors } from '../../../../stores/logs/models/log-severity/log-severity';
import { entriesOfTypesShown, type LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { fractionAt } from '../../../../stores/time-window/models/range-fraction/range-fraction';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';

const TRACK_SLOTS = 320;

const SINGLE_LANE = '*';
const KEY_SEPARATOR = '|';

export type TrackGroup = {
  readonly key: string;
  readonly entryIndexes: readonly number[];
  readonly lead: LogEntry;
  readonly fraction: number;
  readonly color: string;
};

type TrackLane = {
  readonly name: string;
  readonly color: string | null;
  readonly groups: readonly TrackGroup[];
};

type LogTrack = {
  readonly lanes: readonly TrackLane[];
  readonly inViewCount: number;
};

export type TrackRequest = {
  readonly entries: readonly LogEntry[];
  readonly window: TimeRange;
  readonly shownTypes: readonly string[];
  readonly hiddenTypes: ReadonlySet<string>;
  readonly colors: TypeColors;
  readonly isSingleLane: boolean;
  readonly singleLaneName: string;
};

export const entriesInWindow = (entries: readonly LogEntry[], window: TimeRange): readonly LogEntry[] =>
  entries.slice(
    R.sortedIndexWith(entries, (entry) => entry.timeMilliseconds < window.fromMilliseconds),
    R.sortedIndexWith(entries, (entry) => entry.timeMilliseconds <= window.untilMilliseconds),
  );

const mostSevereOf = (entries: readonly [LogEntry, ...LogEntry[]]): LogEntry => R.firstBy(entries, (entry) => severityRankOf(entry.type));

const laneGroupsOf = (lane: string, entries: readonly LogEntry[], request: TrackRequest): readonly TrackGroup[] => {
  const { window, colors, isSingleLane } = request;
  const fractionOf = (entry: LogEntry): number => fractionAt(window, entry.timeMilliseconds);
  const slotted = R.groupBy(entries, (entry) => Math.min(TRACK_SLOTS - 1, Math.floor(fractionOf(entry) * TRACK_SLOTS)));

  return R.map(Object.entries(slotted), ([slot, sharing]) => {
    const [first] = sharing;
    const lead = isSingleLane ? mostSevereOf(sharing) : first;

    return {
      key: `${lane}${KEY_SEPARATOR}${slot}`,
      entryIndexes: R.map(sharing, (entry) => entry.index),
      lead,
      fraction: fractionOf(first),
      color: colorOfType(colors, lead.type),
    };
  });
};

export const logTrackOf = (request: TrackRequest): LogTrack => {
  const { shownTypes, colors, isSingleLane } = request;
  const inView = entriesOfTypesShown(entriesInWindow(request.entries, request.window), request.hiddenTypes);

  if (isSingleLane) {
    return { lanes: [{ name: request.singleLaneName, color: null, groups: laneGroupsOf(SINGLE_LANE, inView, request) }], inViewCount: inView.length };
  }

  const entriesByType = R.groupBy(inView, (entry) => entry.type);

  return {
    lanes: R.map(shownTypes, (type) => ({ name: type, color: colorOfType(colors, type), groups: laneGroupsOf(type, entriesByType[type] ?? [], request) })),
    inViewCount: inView.length,
  };
};

export const groupWithKey = (track: LogTrack, key: string | null): TrackGroup | null =>
  key === null
    ? null
    : (R.pipe(
        track.lanes,
        R.flatMap((lane) => lane.groups),
        R.find((group) => group.key === key),
      ) ?? null);

export const groupHoldingEntry = (track: LogTrack, entryIndex: number | null): TrackGroup | null =>
  entryIndex === null
    ? null
    : (R.pipe(
        track.lanes,
        R.flatMap((lane) => lane.groups),
        R.find((group) => group.entryIndexes.includes(entryIndex)),
      ) ?? null);

export const tipShiftOf = (fraction: number): string => `translateX(-${percentOf(R.clamp(fraction, { min: 0, max: 1 }))})`;
