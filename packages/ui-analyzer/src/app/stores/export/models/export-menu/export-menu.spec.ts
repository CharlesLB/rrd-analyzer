import { describe, expect, it } from 'vitest';
import { placeExportMenu } from './export-menu';

describe('placeExportMenu', () => {
  it('opens six pixels under the button, its right edge aligned with the right edge of the button', () => {
    expect(placeExportMenu({ chartId: 's3', top: 72.4, bottom: 94.4, right: 877.6 }, { width: 924, height: 540 })).toEqual({
      chartId: 's3',
      top: 100,
      bottom: null,
      right: 46,
    });
  });

  it('keeps ten pixels from the right edge of the viewport when the button sits closer than that', () => {
    expect(placeExportMenu({ chartId: 's3', top: 18, bottom: 40, right: 1436 }, { width: 1440, height: 900 })).toEqual({
      chartId: 's3',
      top: 46,
      bottom: null,
      right: 10,
    });
  });

  it('opens upward, six pixels over the button, when the window has no room for it below', () => {
    expect(placeExportMenu({ chartId: 's5', top: 556.2, bottom: 578.2, right: 1236 }, { width: 1280, height: 720 })).toEqual({
      chartId: 's5',
      top: null,
      bottom: 170,
      right: 44,
    });
  });

  it('stays under the button when neither side has room but below has more', () => {
    expect(placeExportMenu({ chartId: 's3', top: 72, bottom: 94, right: 1236 }, { width: 1280, height: 300 })).toEqual({
      chartId: 's3',
      top: 100,
      bottom: null,
      right: 44,
    });
  });
});
