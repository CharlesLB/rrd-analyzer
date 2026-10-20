import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { STATISTIC_KEYS } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { ChartPanelHeaderComponent } from './chart-panel-header.component';

const STATISTICS = {
  cells: [
    { key: STATISTIC_KEYS.CURRENT, label: 'now', value: '35.8', isCurrent: true, isActive: false, lineTip: 'show now line' },
    { key: STATISTIC_KEYS.PERCENTILE95, label: 'p95', value: '54.2', isCurrent: false, isActive: true, lineTip: 'hide p95 line' },
    { key: STATISTIC_KEYS.MINIMUM, label: 'min', value: '22.4', isCurrent: false, isActive: false, lineTip: 'show min line' },
  ],
  unitLabel: '%',
};

const renderHeader = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ChartPanelHeaderComponent, {
    swatches: [{ seriesId: 's3', color: SERIES_COLORS[3], label: 'change the color of atlas_system_cpu_user', isPicking: false }],
    title: 'atlas_system_cpu_user',
    unitLabel: '%',
    isMerged: false,
    seriesButtonLabel: '2 series',
    statistics: STATISTICS,
    isSeriesMenuOpen: false,
    isExportMenuOpen: false,
    ...overrides,
  });

describe('ChartPanelHeaderComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('names a chart of one series with its unit and the statistics of its window', () => {
    const fixture = renderHeader();

    expect(textOf(fixture, '.chart-panel-header-title')).toBe('atlas_system_cpu_user');
    expect(textOf(fixture, '.chart-panel-header-unit')).toBe('%');
    expect(textsOf(fixture, '.chart-panel-header-stat-value')).toEqual(['35.8', '54.2', '22.4']);
    expect(textOf(fixture, '.chart-panel-header-stats-unit')).toBe('%');
    expect(elementOf(fixture, '.chart-panel-header-series')).toBeNull();
  });

  it('marks the current reading alone, and gives it no separator so a wrapped row never starts with a dot', () => {
    const fixture = renderHeader();

    expect(textsOf(fixture, '.chart-panel-header-stat-value-current')).toEqual(['35.8']);
    expect(textsOf(fixture, '.chart-panel-header-stat-separator')).toEqual(['·', '·']);
  });

  it('says so when the window holds no reading', () => {
    const fixture = renderHeader({ statistics: { cells: [], unitLabel: '%' } });

    expect(textOf(fixture, '.chart-panel-header-stats-empty')).toBe('no data');
  });

  it('offers the series menu of a merged chart in place of the statistics, marked while it is open', () => {
    const fixture = renderHeader({ isMerged: true, isSeriesMenuOpen: true });

    expect(textOf(fixture, '.chart-panel-header-series')).toBe('2 series');
    expect(elementOf(fixture, '.chart-panel-header-series-open')).not.toBeNull();
    expect(elementOf(fixture, '.chart-panel-header-stats')).toBeNull();
  });

  it('asks for a menu anchored under the button pressed, and for the chart to go', () => {
    const fixture = renderHeader({ isMerged: true });
    const exportAnchors = vi.fn();
    const seriesAnchors = vi.fn();
    const removals = vi.fn();
    fixture.componentInstance.exportMenuRequested.subscribe(exportAnchors);
    fixture.componentInstance.seriesMenuRequested.subscribe(seriesAnchors);
    fixture.componentInstance.removeRequested.subscribe(removals);

    elementOf(fixture, '.chart-panel-header-export')?.click();
    elementOf(fixture, '.chart-panel-header-series')?.click();
    elementOf(fixture, '.chart-panel-header-remove')?.click();

    expect(exportAnchors).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number), bottom: expect.any(Number), right: expect.any(Number) }));
    expect(seriesAnchors).toHaveBeenCalledTimes(1);
    expect(removals).toHaveBeenCalledTimes(1);
  });

  it('marks the statistics a line is drawn for and asks to toggle the one pressed', () => {
    const fixture = renderHeader();
    const toggled = vi.fn();

    fixture.componentInstance.referenceLineToggled.subscribe(toggled);

    expect(textsOf(fixture, '.chart-panel-header-stat-chip-active .chart-panel-header-stat-label')).toEqual(['p95']);
    expect(elementsOf(fixture, '.chart-panel-header-stat-chip').map((chip) => chip.getAttribute('title'))).toEqual([
      'show now line',
      'hide p95 line',
      'show min line',
    ]);

    elementsOf(fixture, '.chart-panel-header-stat-chip')[1]?.click();

    expect(toggled).toHaveBeenCalledWith(STATISTIC_KEYS.PERCENTILE95);
  });

  it('keeps a press on a chip or on the remove button from turning into a header drag, and lets it reach the rest of the page', () => {
    const fixture = renderHeader();
    const drags = vi.fn();
    const reachedDocument = vi.fn();
    fixture.componentInstance.dragStarted.subscribe(drags);
    document.addEventListener('pointerdown', reachedDocument);

    const draggedFrom = (selector: string): Event => {
      elementOf(fixture, selector)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const drag = new Event('dragstart', { bubbles: true, cancelable: true });
      elementOf(fixture, '.chart-panel-header')?.dispatchEvent(drag);

      return drag;
    };

    const fromChip = draggedFrom('.chart-panel-header-stat-chip');
    const fromRemove = draggedFrom('.chart-panel-header-remove');
    const fromSwatch = draggedFrom('.color-picker-swatch');
    document.removeEventListener('pointerdown', reachedDocument);

    expect(fromChip.defaultPrevented).toBe(true);
    expect(fromRemove.defaultPrevented).toBe(true);
    expect(fromSwatch.defaultPrevented).toBe(true);
    expect(drags).not.toHaveBeenCalled();
    expect(reachedDocument).toHaveBeenCalledTimes(3);
  });

  it('asks for the color picker of the series whose swatch is pressed, under that swatch', () => {
    const fixture = renderHeader();
    const requested = vi.fn();
    fixture.componentInstance.colorMenuRequested.subscribe(requested);

    elementOf(fixture, '.color-picker-swatch')?.click();

    expect(requested).toHaveBeenCalledWith(expect.objectContaining({ seriesId: 's3', left: expect.any(Number), bottom: expect.any(Number) }));
  });

  it('starts the header drag from a press on the title', () => {
    const fixture = renderHeader();
    const drags = vi.fn();
    fixture.componentInstance.dragStarted.subscribe(drags);

    elementOf(fixture, '.chart-panel-header-title')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    elementOf(fixture, '.chart-panel-header')?.dispatchEvent(drag);

    expect(drag.defaultPrevented).toBe(false);
    expect(drags).toHaveBeenCalledWith(drag);
  });
});
