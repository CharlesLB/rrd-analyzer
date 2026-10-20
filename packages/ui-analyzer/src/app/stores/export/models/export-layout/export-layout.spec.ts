import { describe, expect, it } from 'vitest';
import { chartSlotOf, EXPORT_FRAME, plotFrameOf, timeAxisTopOf } from './export-layout';

describe('export layout', () => {
  it('plotFrameOf leaves one value column on the left and a narrow padding on the right', () => {
    expect(plotFrameOf(1)).toEqual({ left: 152, width: 1704 });
  });

  it('plotFrameOf gives every further axis a column of its own on the left', () => {
    expect(plotFrameOf(2)).toEqual({ left: 248, width: 1608 });
  });

  it('chartSlotOf shares the height between the header and the time axis among the charts, with a gap between each two', () => {
    const [first, second] = [chartSlotOf(0, 2), chartSlotOf(1, 2)];

    expect(first).toEqual({ top: 122, height: 431, plot: { top: 168, height: 367 } });
    expect(second.top).toBe(first.top + first.height + 18);
  });

  it('timeAxisTopOf starts right under the last chart, whatever the number of charts', () => {
    const last = chartSlotOf(2, 3);

    expect(timeAxisTopOf(3)).toBeCloseTo(last.top + last.height);
    expect(timeAxisTopOf(1)).toBe(EXPORT_FRAME.HEIGHT - 40 - 38);
  });
});
