import { describe, expect, it } from 'vitest';
import { placeSeriesMenu } from './series-menu';

describe('placeSeriesMenu', () => {
  it('placeSeriesMenu opens under the button of the chart it was asked from, naming that chart', () => {
    expect(placeSeriesMenu({ chartId: 's3', top: 72.4, bottom: 94.4, right: 877.6 }, { width: 924, height: 540 })).toEqual({
      chartId: 's3',
      top: 100,
      bottom: null,
      right: 46,
    });
  });

  it('placeSeriesMenu opens upward from a button near the bottom of the window', () => {
    expect(placeSeriesMenu({ chartId: 's5', top: 556.2, bottom: 578.2, right: 1236 }, { width: 1280, height: 720 })).toEqual({
      chartId: 's5',
      top: null,
      bottom: 170,
      right: 44,
    });
  });
});
