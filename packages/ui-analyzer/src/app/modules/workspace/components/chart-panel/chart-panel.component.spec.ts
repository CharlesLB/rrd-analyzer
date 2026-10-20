import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { CPU_USER_SERIES, MEMORY_USED_SERIES } from '../../../../stores/workspace/models/series/series.fixture';
import type { CanvasChart, Series, SeriesSample, SeriesStatistics } from '../../../../stores/workspace/models/series/series.model';
import { STATISTIC_KEYS, type StatisticKey } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { ChartPanelComponent } from './chart-panel.component';

const WINDOW = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };

const CPU_STATISTICS: SeriesStatistics = { minimum: 22.4, average: 42.6, maximum: 56.4, percentile95: 54.2, last: 35.8, gapCount: 0 };

const chartOf = (
  series: Series,
  samples: readonly SeriesSample[],
  statistics: SeriesStatistics | null = CPU_STATISTICS,
  referenceLines: readonly StatisticKey[] = [],
): CanvasChart => ({
  id: series.id,
  lines: [{ series, samples, axis: 0, statistics }],
  referenceLines,
});

const MERGED_CHART: CanvasChart = {
  id: CPU_USER_SERIES.id,
  lines: [
    { series: CPU_USER_SERIES, samples: [20, 40, null, 35.8], axis: 0, statistics: CPU_STATISTICS },
    { series: MEMORY_USED_SERIES, samples: [2e9, 4e9, 5e9, null], axis: 1, statistics: null },
  ],
  referenceLines: [],
};

const renderPanel = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ChartPanelComponent, {
    chart: chartOf(CPU_USER_SERIES, [20, 40, null, 35.8]),
    window: WINDOW,
    cursor: null,
    selection: null,
    isCursorSynchronized: true,
    isDragging: false,
    dropPosition: null,
    ...overrides,
  });

const percentOf = (value: string | undefined): number => Number.parseFloat(value ?? '');

describe('ChartPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('heads the chart with its name, unit and window statistics, and labels both axes', () => {
    const fixture = renderPanel();

    expect(textOf(fixture, '.chart-panel-header-title')).toBe('atlas_system_cpu_user');
    expect(textOf(fixture, '.chart-panel-header-unit')).toBe('%');
    expect(textsOf(fixture, '.chart-panel-header-stat-label')).toEqual(['now', 'p95', 'max', 'avg', 'min']);
    expect(textsOf(fixture, '.chart-panel-header-stat-value')).toEqual(['35.8', '54.2', '56.4', '42.6', '22.4']);
    expect(textOf(fixture, '.chart-panel-header-stats-unit')).toBe('%');
    expect(textsOf(fixture, '.chart-plot-axis-label')).toEqual(['100.0%', '66.7%', '33.3%', '0.0%']);
    expect(textsOf(fixture, '.chart-panel-tick')).toEqual([
      '28/08 15:00',
      '28/08 18:00',
      '28/08 21:00',
      '29/08 00:00',
      '29/08 03:00',
      '29/08 06:00',
      '29/08 09:00',
      '29/08 12:00',
      '29/08 15:00',
    ]);
    expect(elementOf(fixture, '.plot-drawing-line')?.getAttribute('d')).toBe('M0.0 77.6 L333.3 59.2 M1000.0 63.1');
  });

  it('sets each time label at the share of the plot where its gridline is ruled', () => {
    const lefts = elementsOf(renderPanel(), '.chart-panel-tick').map((tick) => tick.style.left);

    expect(lefts).toEqual(['0%', '12.5%', '25%', '37.5%', '50%', '62.5%', '75%', '87.5%', '100%']);
  });

  it('calls a unitless series n/a and a window with no reading no data', () => {
    const fixture = renderPanel({ chart: chartOf({ ...CPU_USER_SERIES, unit: '' }, [null, null], null) });

    expect(textOf(fixture, '.chart-panel-header-unit')).toBe('n/a');
    expect(textOf(fixture, '.chart-panel-header-stats-empty')).toBe('no data');
    expect(countOf(fixture, '.chart-panel-header-stat')).toBe(0);
  });

  it('separates every cell but the current reading, so the first one left after a wrap never begins with a dot', () => {
    expect(textsOf(renderPanel(), '.chart-panel-header-stat-separator')).toEqual(['·', '·', '·', '·']);
  });

  it('counts the gaps of the window beside the unit the statistics are read in', () => {
    const fixture = renderPanel({ chart: chartOf(CPU_USER_SERIES, [20, null, 35.8], { ...CPU_STATISTICS, gapCount: 3 }) });

    expect(textOf(fixture, '.chart-panel-header-stats-unit')).toBe('% · 3 gaps');
  });

  it('follows the shared cursor with a dashed line, a dot and a tooltip of the bucket under it', () => {
    const fixture = renderPanel({ cursor: { fraction: 1 / 3, chartId: null }, cursorTime: '28/08 23:00' });

    expect(elementOf(fixture, '.chart-crosshair-line')?.style.left).toBe('33.33%');
    expect(percentOf(elementOf(fixture, '.chart-crosshair-dot')?.style.top)).toBeCloseTo(59.2);
    expect(textOf(fixture, '.chart-crosshair-tip-time')).toBe('28/08 23:00');
    expect(textOf(fixture, '.chart-crosshair-tip-value')).toBe('40.0%');
  });

  it('shows no dot and a tooltip saying no data over a hole, and no cursor at all for another chart when crosshairs are not shared', () => {
    const overHole = renderPanel({ cursor: { fraction: 2 / 3, chartId: null } });

    expect(elementOf(overHole, '.chart-crosshair-line')).not.toBeNull();
    expect(elementOf(overHole, '.chart-crosshair-dot')).toBeNull();
    expect(textOf(overHole, '.chart-crosshair-tip-gap')).toBe('no data');

    const elsewhere = renderPanel({ cursor: { fraction: 0.5, chartId: 's9' }, isCursorSynchronized: false });

    expect(elementOf(elsewhere, '.chart-crosshair-line')).toBeNull();
  });

  it('heads a merged chart with every series it draws and a legend of their last readings, one axis per unit, all of them on the left', () => {
    const fixture = renderPanel({ chart: MERGED_CHART });

    expect(textOf(fixture, '.chart-panel-header-title')).toBe('atlas_system_cpu_user + atlas_system_memory_used');
    expect(textOf(fixture, '.chart-panel-header-unit')).toBe('%, B');
    expect(countOf(fixture, '.chart-panel-header .color-swatch')).toBe(2);
    expect(elementOf(fixture, '.chart-panel-header-stats')).toBeNull();
    expect(textsOf(fixture, '.chart-legend-name')).toEqual(['atlas_system_cpu_user', 'atlas_system_memory_used']);
    expect(textsOf(fixture, '.chart-legend-value')).toEqual(['35.8%', '4.66 GiB']);
    expect(countOf(fixture, '.plot-drawing-line')).toBe(2);
    expect(textsOf(fixture, '.chart-plot-axis-value').slice(0, 2)).toEqual(['100.0%', '5.03 GiB']);
  });

  it('reads every line of a merged chart under the cursor, each dot on its own axis and the legend following it', () => {
    const fixture = renderPanel({ chart: MERGED_CHART, cursor: { fraction: 1 / 3, chartId: null } });

    expect(countOf(fixture, '.chart-crosshair-dot')).toBe(2);
    expect(textsOf(fixture, '.chart-crosshair-tip-value')).toEqual(['40.0%', '3.73 GiB']);
    expect(textsOf(fixture, '.chart-legend-value')).toEqual(['40.0%', '3.73 GiB']);
    expect(countOf(fixture, '.chart-legend-value-live')).toBe(2);
  });

  it('follows the cursor of another chart only when crosshairs are shared, a merged chart answering to the id of its first series', () => {
    expect(countOf(renderPanel({ chart: MERGED_CHART, cursor: { fraction: 0.5, chartId: 's3' }, isCursorSynchronized: false }), '.chart-crosshair-line')).toBe(
      1,
    );
    expect(countOf(renderPanel({ chart: MERGED_CHART, cursor: { fraction: 0.5, chartId: 's5' }, isCursorSynchronized: false }), '.chart-crosshair-line')).toBe(
      0,
    );
  });

  it('offers the series menu from the header of a merged chart only, anchored under the button, and marks the button while the menu is open', () => {
    const fixture = renderPanel({ chart: MERGED_CHART });
    const anchors = vi.fn();
    fixture.componentInstance.seriesMenuRequested.subscribe(anchors);
    const button = elementOf(fixture, '.chart-panel-header-series');
    vi.spyOn(button as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 72, bottom: 94, right: 800 } as DOMRect);

    button?.click();

    expect(textOf(fixture, '.chart-panel-header-series')).toBe('2 series');
    expect(anchors).toHaveBeenCalledWith({ chartId: CPU_USER_SERIES.id, top: 72, bottom: 94, right: 800 });
    expect(elementOf(renderPanel(), '.chart-panel-header-series')).toBeNull();
    expect(elementOf(renderPanel({ chart: MERGED_CHART, isSeriesMenuOpen: true }), '.chart-panel-header-series-open')).not.toBeNull();
  });

  it('offers the export menu from its header, anchored under the button, and marks the button while the menu is open', () => {
    const fixture = renderPanel();
    const anchors = vi.fn();
    fixture.componentInstance.exportMenuRequested.subscribe(anchors);
    const button = elementOf(fixture, '.chart-panel-header-export');
    vi.spyOn(button as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 72, bottom: 94, right: 878 } as DOMRect);

    button?.click();

    expect(textOf(fixture, '.chart-panel-header-export')).toBe('⤓ Export');
    expect(anchors).toHaveBeenCalledWith({ chartId: CPU_USER_SERIES.id, top: 72, bottom: 94, right: 878 });
    expect(elementOf(fixture, '.chart-panel-header-export-open')).toBeNull();
    expect(elementOf(renderPanel({ isExportMenuOpen: true }), '.chart-panel-header-export-open')).not.toBeNull();
  });

  it('draws the drag selection band between its two ends', () => {
    const band = elementOf(renderPanel({ selection: { anchorFraction: 0.6, focusFraction: 0.2 } }), '.chart-panel-selection');

    expect(percentOf(band?.style.left)).toBeCloseTo(20);
    expect(percentOf(band?.style.width)).toBeCloseTo(40);
  });

  it('shows the drop indicator for its position', () => {
    expect(elementOf(renderPanel({ dropPosition: 'before' }), '.chart-drop-indicator-before')).not.toBeNull();
    expect(elementOf(renderPanel({ dropPosition: 'after' }), '.chart-drop-indicator-after')).not.toBeNull();
    expect(textOf(renderPanel({ dropPosition: 'merge' }), '.chart-drop-indicator-merge .chart-drop-indicator-label')).toBe('Merge');
  });

  it('resizes the chart to where the grip was dragged, and reports the chart it belongs to', () => {
    const fixture = renderPanel();
    const resized = vi.fn();
    fixture.componentInstance.resized.subscribe(resized);
    const grip = Object.assign(elementOf(fixture, '.chart-panel-resize') ?? document.createElement('div'), { setPointerCapture: vi.fn() });

    grip.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientY: 100 }));
    grip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 480 }));

    expect(resized).toHaveBeenCalledWith({ chartId: CPU_USER_SERIES.id, height: 380 });
  });

  it('stops resizing once the grip is released, and ignores a move that never pressed it', () => {
    const fixture = renderPanel();
    const resized = vi.fn();
    fixture.componentInstance.resized.subscribe(resized);
    const grip = Object.assign(elementOf(fixture, '.chart-panel-resize') ?? document.createElement('div'), { setPointerCapture: vi.fn() });

    grip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 480 }));
    grip.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientY: 100 }));
    grip.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    grip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 900 }));

    expect(resized).not.toHaveBeenCalled();
  });

  it('asks for the chart to be fitted again on a double click of the grip', () => {
    const fixture = renderPanel();
    const cleared = vi.fn();
    fixture.componentInstance.resizeCleared.subscribe(cleared);

    elementOf(fixture, '.chart-panel-resize')?.dispatchEvent(new MouseEvent('dblclick'));

    expect(cleared).toHaveBeenCalledWith(CPU_USER_SERIES.id);
  });

  it('starts a zoom selection on a primary press only, leaving right and middle clicks to the browser', () => {
    const fixture = renderPanel();
    const started = vi.fn();
    fixture.componentInstance.selectionStarted.subscribe(started);
    const overlay = Object.assign(elementOf(fixture, '.chart-panel-overlay') ?? document.createElement('div'), { setPointerCapture: vi.fn() });
    const pressWith = (button: number) => overlay.dispatchEvent(new PointerEvent('pointerdown', { button, pointerId: 1 }));

    pressWith(2);
    pressWith(1);

    expect(started).not.toHaveBeenCalled();

    pressWith(0);

    expect(started).toHaveBeenCalledTimes(1);
  });

  it('reports removal, a double click and a drop target only while something is dragged', () => {
    const fixture = renderPanel();
    const removed = vi.fn();
    const zoomedBack = vi.fn();
    const targeted = vi.fn();
    fixture.componentInstance.removeRequested.subscribe(removed);
    fixture.componentInstance.zoomBackRequested.subscribe(zoomedBack);
    fixture.componentInstance.dropTargetChanged.subscribe(targeted);

    elementOf(fixture, '.chart-panel-header-remove')?.click();
    elementOf(fixture, '.chart-panel-overlay')?.dispatchEvent(new MouseEvent('dblclick'));
    elementOf(fixture, '.chart-panel')?.dispatchEvent(new Event('dragover'));

    expect(removed).toHaveBeenCalledWith(CPU_USER_SERIES.id);
    expect(zoomedBack).toHaveBeenCalledTimes(1);
    expect(targeted).not.toHaveBeenCalled();
  });

  it('reports a drag leaving the chart only while something is dragged', () => {
    const idle = renderPanel();
    const dragged = renderPanel({ isDragging: true });
    const idleLeft = vi.fn();
    const draggedLeft = vi.fn();
    idle.componentInstance.dropTargetLeft.subscribe(idleLeft);
    dragged.componentInstance.dropTargetLeft.subscribe(draggedLeft);
    const leaveEvent = () => new MouseEvent('dragleave', { clientX: 900, clientY: 900 });

    elementOf(idle, '.chart-panel')?.dispatchEvent(leaveEvent());
    elementOf(dragged, '.chart-panel')?.dispatchEvent(leaveEvent());

    expect(idleLeft).not.toHaveBeenCalled();
    expect(draggedLeft).toHaveBeenCalledTimes(1);
  });

  it('draws a line at each chosen statistic, in the colour of the chart, and passes the toggle on', () => {
    const fixture = renderPanel({
      chart: chartOf(CPU_USER_SERIES, [20, 40, null, 35.8], CPU_STATISTICS, [STATISTIC_KEYS.AVERAGE, STATISTIC_KEYS.MAXIMUM]),
    });

    const toggled = vi.fn();

    fixture.componentInstance.referenceLineToggled.subscribe(toggled);

    expect(textsOf(fixture, '.chart-plot-reference-label')).toEqual(['max 56.4', 'avg 42.6']);
    expect(elementsOf(fixture, '.plot-drawing-reference').map((line) => line.getAttribute('stroke'))).toEqual([CPU_USER_SERIES.color, CPU_USER_SERIES.color]);
    expect(textsOf(fixture, '.chart-panel-header-stat-chip-active .chart-panel-header-stat-label')).toEqual(['max', 'avg']);

    elementOf(fixture, '.chart-panel-header-stat-chip')?.click();

    expect(toggled).toHaveBeenCalledWith(STATISTIC_KEYS.CURRENT);
  });

  it('draws no reference line once the chart is merged, where the chips that would take the line away are gone', () => {
    const fixture = renderPanel({ chart: { ...MERGED_CHART, referenceLines: [STATISTIC_KEYS.AVERAGE] } });

    expect(countOf(fixture, '.plot-drawing-reference')).toBe(0);
    expect(countOf(fixture, '.chart-plot-reference-label')).toBe(0);
  });

  it('draws no reference line for a chart that was never asked for one', () => {
    expect(countOf(renderPanel(), '.plot-drawing-reference')).toBe(0);
  });

  it('offers the grip to the keyboard as a separator: the arrows step the height and Enter gives it back to the canvas', () => {
    const fixture = renderPanel();
    const resized = vi.fn();
    const cleared = vi.fn();
    fixture.componentInstance.resized.subscribe(resized);
    fixture.componentInstance.resizeCleared.subscribe(cleared);
    const grip = elementOf(fixture, '.chart-panel-resize');

    expect([grip?.getAttribute('role'), grip?.tabIndex, grip?.getAttribute('aria-label')]).toEqual(['separator', 0, grip?.title]);

    grip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    grip?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(resized).toHaveBeenCalledWith({ chartId: CPU_USER_SERIES.id, height: 160 });
    expect(cleared).toHaveBeenCalledWith(CPU_USER_SERIES.id);
  });

  it('a cancelled resize gives the chart back the height it had, or its automatic height when it had none, and ends the drag', () => {
    const drag = (fixture: ReturnType<typeof renderPanel>): void => {
      const grip = Object.assign(elementOf(fixture, '.chart-panel-resize') ?? document.createElement('div'), { setPointerCapture: vi.fn() });

      grip.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientY: 100 }));
      grip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientY: 480 }));
    };

    const sized = renderPanel({ height: 260 });
    const resized = vi.fn();
    sized.componentInstance.resized.subscribe(resized);
    const automatic = renderPanel();
    const cleared = vi.fn();
    automatic.componentInstance.resizeCleared.subscribe(cleared);

    drag(sized);
    drag(automatic);

    expect(sized.componentInstance.isResizing()).toBe(true);

    sized.componentInstance.cancelResize();
    automatic.componentInstance.cancelResize();

    expect(resized).toHaveBeenLastCalledWith({ chartId: CPU_USER_SERIES.id, height: 260 });
    expect(cleared).toHaveBeenCalledWith(CPU_USER_SERIES.id);
    expect(sized.componentInstance.isResizing()).toBe(false);
  });

  it('a press the browser takes over, as when a touch turns into a scroll of the canvas, cancels the selection instead of finishing it', () => {
    const fixture = renderPanel();
    const cancelled = vi.fn();
    const finished = vi.fn();
    fixture.componentInstance.selectionCancelled.subscribe(cancelled);
    fixture.componentInstance.selectionFinished.subscribe(finished);

    elementOf(fixture, '.chart-panel-overlay')?.dispatchEvent(new PointerEvent('pointercancel'));

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(finished).not.toHaveBeenCalled();
  });

  it('reports the pointer on the sample column under it, so moving inside one column reports the same place', () => {
    const fixture = renderPanel();
    const moved = vi.fn();
    fixture.componentInstance.pointerMoved.subscribe(moved);
    const overlay = elementOf(fixture, '.chart-panel-overlay');

    if (overlay !== null) {
      overlay.getBoundingClientRect = () => ({ left: 0, width: 1000, right: 1000, top: 0, bottom: 0, height: 0, x: 0, y: 0, toJSON: () => '' });
    }

    overlay?.dispatchEvent(new PointerEvent('pointermove', { clientX: 400 }));
    overlay?.dispatchEvent(new PointerEvent('pointermove', { clientX: 380 }));

    expect(moved.mock.calls).toEqual([[1 / 3], [1 / 3]]);
  });
});
