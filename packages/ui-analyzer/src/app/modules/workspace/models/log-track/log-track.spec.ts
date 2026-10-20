import { describe, expect, it } from 'vitest';
import { defaultTypeColorsOf } from '../../../../stores/logs/models/log-severity/log-severity';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { entriesInWindow, groupHoldingEntry, groupWithKey, logTrackOf, type TrackRequest, tipShiftOf } from './log-track';

const WINDOW = { fromMilliseconds: 0, untilMilliseconds: 3200 };
const COLORS = defaultTypeColorsOf(['error', 'warn', 'info']);

const entriesAt = (placed: readonly (readonly [number, string])[]): readonly LogEntry[] =>
  placed.map(([timeMilliseconds, type], index) => ({ index, timeMilliseconds, type, message: `entry ${index}`, record: {} }));

const requestFor = (entries: readonly LogEntry[], changes: Partial<TrackRequest> = {}): TrackRequest => ({
  entries,
  window: WINDOW,
  shownTypes: ['error', 'warn', 'info'],
  hiddenTypes: new Set(),
  colors: COLORS,
  isSingleLane: false,
  singleLaneName: 'all types',
  ...changes,
});

describe('entriesInWindow', () => {
  it('entriesInWindow, for entries sorted by time, keeps those from the first instant of the window to the last', () => {
    const entries = entriesAt([
      [-1, 'info'],
      [0, 'info'],
      [1600, 'info'],
      [3200, 'info'],
      [3201, 'info'],
    ]);

    expect(entriesInWindow(entries, WINDOW).map((entry) => entry.index)).toEqual([1, 2, 3]);
  });
});

describe('logTrackOf', () => {
  it('logTrackOf, with one lane per type, puts the most severe type on top and each entry on its own lane', () => {
    const track = logTrackOf(
      requestFor(
        entriesAt([
          [100, 'info'],
          [800, 'error'],
          [1600, 'warn'],
        ]),
      ),
    );

    expect(track.lanes.map((lane) => [lane.name, lane.groups.length])).toEqual([
      ['error', 1],
      ['warn', 1],
      ['info', 1],
    ]);
    expect(track.lanes[0]?.groups[0]).toMatchObject({ key: 'error|80', entryIndexes: [1], fraction: 0.25, color: COLORS.get('error') });
    expect(track.inViewCount).toBe(3);
  });

  it('logTrackOf, for entries of one type that fall in the same slot, groups them into one marker led by the earliest', () => {
    const track = logTrackOf(
      requestFor(
        entriesAt([
          [1000, 'info'],
          [1004, 'info'],
          [1009, 'error'],
          [1010, 'info'],
        ]),
      ),
    );

    const [group] = track.lanes[2]?.groups ?? [];

    expect(track.lanes[2]?.groups).toHaveLength(2);
    expect(group?.entryIndexes).toEqual([0, 1]);
    expect(group?.lead.index).toBe(0);
  });

  it('logTrackOf, however many entries the window holds, never makes more than 320 markers on a lane', () => {
    const entries = entriesAt(Array.from({ length: 5000 }, (_unused, index) => [index * 0.64, 'info'] as const));

    expect(logTrackOf(requestFor(entries)).lanes[2]?.groups).toHaveLength(320);
  });

  it('logTrackOf, with a type hidden, leaves its entries out of the lanes and out of the count', () => {
    const entries = entriesAt([
      [100, 'info'],
      [200, 'error'],
    ]);

    const track = logTrackOf(requestFor(entries, { shownTypes: ['error'], hiddenTypes: new Set(['info']) }));

    expect(track.lanes.map((lane) => lane.name)).toEqual(['error']);
    expect(track.inViewCount).toBe(1);
  });

  it('logTrackOf, on a single row, groups every type together and gives each marker the colour of its most severe entry', () => {
    const entries = entriesAt([
      [1000, 'info'],
      [1004, 'error'],
      [2000, 'warn'],
    ]);

    const track = logTrackOf(requestFor(entries, { isSingleLane: true }));
    const [lane] = track.lanes;

    expect(track.lanes).toHaveLength(1);
    expect(lane?.name).toBe('all types');
    expect(lane?.groups.map((group) => [group.entryIndexes, group.lead.type, group.color])).toEqual([
      [[0, 1], 'error', COLORS.get('error')],
      [[2], 'warn', COLORS.get('warn')],
    ]);
  });

  it('logTrackOf, for an entry at the very end of the window, keeps it on the last slot', () => {
    const track = logTrackOf(requestFor(entriesAt([[3200, 'info']])));

    expect(track.lanes[2]?.groups[0]?.key).toBe('info|319');
  });
});

describe('groupWithKey', () => {
  it('groupWithKey, for a key on the track, finds its marker, and nothing once the marker is gone', () => {
    const track = logTrackOf(requestFor(entriesAt([[800, 'error']])));

    expect(groupWithKey(track, 'error|80')?.lead.index).toBe(0);
    expect(groupWithKey(track, 'error|81')).toBeNull();
    expect(groupWithKey(track, null)).toBeNull();
  });
});

describe('tipShiftOf', () => {
  it('slides the tooltip back by the share of its own width its marker sits at, so no marker pushes it off the track', () => {
    expect([0, 0.15, 0.5, 1].map(tipShiftOf)).toEqual(['translateX(-0.00%)', 'translateX(-15.00%)', 'translateX(-50.00%)', 'translateX(-100.00%)']);
  });
});

describe('groupHoldingEntry', () => {
  it('groupHoldingEntry finds the marker an entry was gathered into, and none for an entry out of view or for no entry', () => {
    const track = logTrackOf(
      requestFor(
        entriesAt([
          [1600, 'error'],
          [1602, 'error'],
          [9000, 'error'],
        ]),
      ),
    );

    expect(groupHoldingEntry(track, 1)?.entryIndexes).toEqual([0, 1]);
    expect(groupHoldingEntry(track, 2)).toBeNull();
    expect(groupHoldingEntry(track, null)).toBeNull();
  });
});
