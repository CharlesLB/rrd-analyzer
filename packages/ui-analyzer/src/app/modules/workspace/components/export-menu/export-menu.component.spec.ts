import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { cssColorOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ExportMenuComponent } from './export-menu.component';

const renderMenu = (chartCount = 2) =>
  renderWithInputs(ExportMenuComponent, {
    color: SERIES_COLORS[3],
    scopeLabel: 'atlas_system_cpu_user · 24 h',
    placement: { top: 100, bottom: null, right: 46 },
    chartCount,
  });

describe('ExportMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('export menu opened from a chart names its scope and offers the four formats with the frame they produce', () => {
    const fixture = renderMenu();

    expect(textOf(fixture, '.export-menu-scope-label')).toBe('atlas_system_cpu_user · 24 h');
    expect(elementOf(fixture, '.export-menu-scope .color-swatch')?.style.background).toBe(cssColorOf(SERIES_COLORS[3]));
    expect(textsOf(fixture, '.menu-option-tag')).toEqual(['PNG', 'COPY', 'SVG', 'CSV']);
    expect(textsOf(fixture, '.menu-option-heading')).toEqual(['PNG image', 'Copy PNG to clipboard', 'SVG vector', 'CSV data']);
    expect(textsOf(fixture, '.menu-option-detail')).toEqual([
      '1920 × 1080',
      '1920 × 1080, paste into a doc',
      '1920 × 1080 vector',
      'raw samples for this series',
    ]);
  });

  it('export menu opened from a merged chart says its csv holds the samples of every series in it', () => {
    const fixture = renderWithInputs(ExportMenuComponent, {
      color: SERIES_COLORS[3],
      scopeLabel: 'a + b · 24 h',
      placement: { top: 100, bottom: null, right: 46 },
      chartCount: 2,
      seriesCount: 2,
    });

    expect(textsOf(fixture, '.menu-option-detail').at(-1)).toBe('raw samples for its 2 series');
  });

  it('export menu is fixed under the button it was opened from', () => {
    const menu = elementOf(renderMenu(), '.anchored-menu');

    expect(menu?.style.top).toBe('100px');
    expect(menu?.style.right).toBe('46px');
  });

  it('export menu over a canvas of several charts adds a row that exports them all', () => {
    const fixture = renderMenu(3);

    expect(textOf(fixture, '.export-menu-all-label')).toBe('PNG of all 3 charts on the canvas');
    expect(elementOf(fixture, '.export-menu-divider')).not.toBeNull();
  });

  it('export menu over a canvas of one chart leaves the all-charts row out', () => {
    const fixture = renderMenu(1);

    expect(elementOf(fixture, '.export-menu-all')).toBeNull();
    expect(elementOf(fixture, '.export-menu-divider')).toBeNull();
  });

  it('export menu reports the format picked, the whole-canvas export and a click on the backdrop', () => {
    const fixture = renderMenu();
    const component = fixture.componentInstance;
    const chosen = vi.fn();
    const everything = vi.fn();
    const closed = vi.fn();
    component.formatChosen.subscribe(chosen);
    component.allChartsRequested.subscribe(everything);
    component.closeRequested.subscribe(closed);

    elementsOf(fixture, '.menu-option').forEach((row) => {
      row.click();
    });
    elementOf(fixture, '.export-menu-all')?.click();
    elementOf(fixture, '.anchored-menu-backdrop')?.click();

    expect(chosen.mock.calls).toEqual([['png'], ['copy'], ['svg'], ['csv']]);
    expect(everything).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
