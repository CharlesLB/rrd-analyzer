import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  bundleDtoFixture,
  chartsDtoFixture,
  FIXTURE_UNTIL_MILLISECONDS,
  provideGatewayStub,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { countOf, elementOf, elementsOf, textOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ExportStore } from '../../../../stores/export/store/export-store/export.store';
import { InsightsStore } from '../../../../stores/insights/store/insights-store/insights.store';
import { LogsStore } from '../../../../stores/logs/store/logs-store/logs.store';
import { logFileFixture } from '../../../../stores/logs/store/logs-store/logs.store.fixture';
import { SampleAnalysisStore } from '../../../../stores/sample-analysis/store/sample-analysis-store/sample-analysis.store';
import { SettingsStore } from '../../../../stores/settings/store/settings-store/settings.store';
import { LiveSessionStore } from '../../../../stores/sharing/store/live-session-store/live-session.store';
import { TimeWindowStore } from '../../../../stores/time-window/store/time-window-store/time-window.store';
import { chartIdOf } from '../../../../stores/workspace/models/plotted-chart/plotted-chart';
import { CanvasDragStore } from '../../../../stores/workspace/store/canvas-drag-store/canvas-drag.store';
import { SeriesDataStore } from '../../../../stores/workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../../stores/workspace/store/workspace-store/workspace.store';
import { WorkspacePageComponent } from './workspace-page.component';

const renderPage = async () => {
  const fixture = TestBed.createComponent(WorkspacePageComponent);
  fixture.componentRef.setInput('analysisId', 'a1');
  fixture.detectChanges();
  await vi.waitFor(() => expect(TestBed.inject(WorkspaceStore).analysisName()).not.toBe(''));
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
};

const click = (fixture: Awaited<ReturnType<typeof renderPage>>, selector: string, index = 0): void => {
  elementsOf(fixture, selector)[index]?.click();
  fixture.detectChanges();
};

const press = (fixture: Awaited<ReturnType<typeof renderPage>>, key: string, modifiers: KeyboardEventInit = {}): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ...modifiers }));
  fixture.detectChanges();
};

const dragEventOf = (type: string, init: MouseEventInit, dataTransfer: unknown): Event => Object.assign(new MouseEvent(type, init), { dataTransfer });

describe('WorkspacePageComponent', () => {
  let gateway: AnalyzerGateway;

  beforeEach(() => {
    stubBrowserStorage();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
    gateway = analyzerGatewayStub({ openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(4, { canvas: chartsDtoFixture('s0', 's1') })) });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideGatewayStub(gateway),
        WorkspaceStore,
        SeriesDataStore,
        CanvasDragStore,
        TimeWindowStore,
        InsightsStore,
        LogsStore,
        ExportStore,
        LiveSessionStore,
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('runs insights from the keyboard, except while the reader types in a field', async () => {
    const fixture = await renderPage();
    const insights = TestBed.inject(InsightsStore);

    elementOf(fixture, '.chart-library-filter input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }));
    await fixture.whenStable();

    expect(gateway.runInsights).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i' }));
    await fixture.whenStable();

    expect(gateway.runInsights).toHaveBeenCalledTimes(1);
    expect(insights.status()).toBe('done');
  });

  it('shades the findings of a run on every chart, and stops once the findings are hidden', async () => {
    const fixture = await renderPage();
    const insights = TestBed.inject(InsightsStore);
    vi.useFakeTimers();
    const running = insights.run();
    await vi.advanceTimersByTimeAsync(1800);
    await running;
    vi.useRealTimers();
    fixture.detectChanges();

    expect(countOf(fixture, '.plot-drawing-band')).toBeGreaterThan(0);

    insights.toggleOverlays();
    fixture.detectChanges();

    expect(countOf(fixture, '.plot-drawing-band')).toBe(0);
  });

  it('opens the analysis named by the route with its library and canvas', async () => {
    const fixture = await renderPage();

    expect(textOf(fixture, '.analysis-title-name')).toBe('Atlas prod · capacity');
    expect(textOf(fixture, '.time-nav-dates-label')).toBe('Last 24 hours');
    expect(countOf(fixture, 'app-library-thumbnail')).toBe(4);
    expect(countOf(fixture, 'app-chart-panel')).toBe(2);
    expect(countOf(fixture, 'app-timeline-strip')).toBe(1);
  });

  it('goes back to the menu from the bar', async () => {
    const fixture = await renderPage();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    click(fixture, '.timeframe-bar-back');

    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('opens the timeframe popover on quick select, and a preset applies and closes it', async () => {
    const fixture = await renderPage();

    click(fixture, '.time-nav-dates');

    expect(elementOf(fixture, 'app-quick-select')).not.toBeNull();

    click(fixture, '.quick-select-preset', 6);

    expect(TestBed.inject(TimeWindowStore).timeframeLabel()).toBe('Last 7 days');
    expect(elementOf(fixture, 'app-timeframe-popover')).toBeNull();
  });

  it('keeps the popover open on an absolute range it had to fit to the data, saying what the range became', async () => {
    const fixture = await renderPage();

    click(fixture, '.time-nav-dates');
    click(fixture, '.timeframe-popover-tab', 1);
    typeInto(fixture, '.absolute-range-input', '2020-01-01 00:00');
    fixture.detectChanges();
    click(fixture, '.absolute-range-apply');

    expect(TestBed.inject(TimeWindowStore).window().fromMilliseconds).toBe(TestBed.inject(TimeWindowStore).bounds().fromMilliseconds);
    expect(textOf(fixture, '.absolute-range-notice')).toMatch(/^adjusted to fit the data: now \d{4}-\d{2}-\d{2} \d{2}:\d{2} to /);

    click(fixture, '.timeframe-popover-backdrop');
    click(fixture, '.time-nav-dates');

    expect(elementOf(fixture, '.absolute-range-notice')).toBeNull();
  });

  it('keeps the popover open and the window as it was for a quick count that is not a whole number', async () => {
    const fixture = await renderPage();
    const before = TestBed.inject(TimeWindowStore).window();

    click(fixture, '.time-nav-dates');
    typeInto(fixture, '.quick-select-count', 'a few');
    fixture.detectChanges();
    click(fixture, '.quick-select-apply');

    expect(TestBed.inject(TimeWindowStore).window()).toBe(before);
    expect(elementOf(fixture, 'app-timeframe-popover')).not.toBeNull();
  });

  it('Escape with the analysis menu open over the dates closes the analysis menu alone', async () => {
    const fixture = await renderPage();

    click(fixture, '.time-nav-dates');
    click(fixture, '.analysis-title-menu-toggle');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-analysis-title .menu-option')).toBeNull();
    expect(elementOf(fixture, 'app-timeframe-popover')).not.toBeNull();
  });

  it('fills the absolute fields from the window, and applies them from the absolute tab', async () => {
    const fixture = await renderPage();

    click(fixture, '.time-nav-dates');
    click(fixture, '.timeframe-popover-tab', 1);
    click(fixture, '.absolute-range-apply');

    expect(TestBed.inject(TimeWindowStore).window()).toEqual({
      fromMilliseconds: FIXTURE_UNTIL_MILLISECONDS - 24 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: FIXTURE_UNTIL_MILLISECONDS,
    });
    expect(elementOf(fixture, 'app-timeframe-popover')).toBeNull();
  });

  it('removes a chart from its panel and adds another from the library', async () => {
    const fixture = await renderPage();

    click(fixture, '.chart-panel-header-remove', 1);

    expect(countOf(fixture, 'app-chart-panel')).toBe(1);

    click(fixture, '.library-thumbnail', 3);

    expect(TestBed.inject(WorkspaceStore).canvas().map(chartIdOf)).toEqual(['s0', 's3']);
  });

  it('marks only the chart a drag is over as the drop target', async () => {
    const fixture = await renderPage();
    const canvasDrag = TestBed.inject(CanvasDragStore);

    canvasDrag.beginDrag('s3');
    await vi.waitFor(() => expect(canvasDrag.isDragging()).toBe(true));
    canvasDrag.trackDropTarget('s1', 0.1);
    fixture.detectChanges();
    const panels = elementsOf(fixture, 'app-chart-panel');

    expect(panels[0]?.querySelector('.chart-drop-indicator-before')).toBeNull();
    expect(panels[1]?.querySelector('.chart-drop-indicator-before')).not.toBeNull();
  });

  it('opens the context menu of a library card and adds the chart from it', async () => {
    const fixture = await renderPage();

    elementsOf(fixture, '.library-thumbnail')[2]?.dispatchEvent(new MouseEvent('contextmenu', { clientX: 60, clientY: 200, cancelable: true }));
    fixture.detectChanges();

    expect(textOf(fixture, '.context-menu-title')).toBe('atlas_metric_2');

    click(fixture, '.context-menu-item', 1);

    expect(TestBed.inject(WorkspaceStore).canvas().map(chartIdOf)).toEqual(['s0', 's1', 's2']);
    expect(elementOf(fixture, 'app-context-menu')).toBeNull();
  });

  it('opens the export menu from a chart header, marks that button, and exports the CSV of that chart alone from it', async () => {
    const fixture = await renderPage();

    click(fixture, '.chart-panel-header-export', 1);

    expect(textOf(fixture, '.export-menu-scope-label')).toBe('atlas_metric_1 · 24 h');
    expect(countOf(fixture, '.chart-panel-header-export-open')).toBe(1);
    expect(elementsOf(fixture, '.chart-panel-header-export')[1]?.classList).toContain('chart-panel-header-export-open');

    click(fixture, 'app-export-menu .menu-option', 3);

    expect(TestBed.inject(ExportStore).menu()).toBeNull();
    await vi.waitFor(() => expect(gateway.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ seriesIds: ['s1'] })));
  });

  it('collapses the library to its rail', async () => {
    const fixture = await renderPage();

    click(fixture, '.chart-library-toggle');

    expect(elementOf(fixture, '.chart-library-rail')).not.toBeNull();
  });

  it('offers to add logs from the bar, and once a file is placed, shows its entries on a track under the charts', async () => {
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);

    expect(textOf(fixture, '.logs-trigger-add')).toBe('+Add logs');
    expect(elementOf(fixture, '.log-track')).toBeNull();

    await logs.load(logFileFixture());
    logs.confirmSetup();
    fixture.detectChanges();

    expect(textOf(fixture, '.logs-trigger-count')).toBe('6');
    expect(textOf(fixture, '.log-track-in-view')).toBe('6 in view');
    expect(countOf(fixture, '.log-track-marker')).toBe(6);
  });

  it('opens the sample on the log it comes with, already placed on the track under the charts', async () => {
    TestBed.overrideProvider(SampleAnalysisStore, { useValue: { logToOpenWith: vi.fn().mockResolvedValue(logFileFixture()) } });
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);

    await vi.waitFor(() => expect(logs.status()).toBe('ready'));
    fixture.detectChanges();

    expect(textOf(fixture, '.logs-trigger-count')).toBe('6');
    expect(elementOf(fixture, '.log-setup-panel')).toBeNull();
    expect(countOf(fixture, '.log-track-marker')).toBe(6);
  });

  it('opens a clicked log entry beside the charts, marks its time on every chart, and steps and closes from the keyboard', async () => {
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);
    await logs.load(logFileFixture());
    logs.confirmSetup();
    fixture.detectChanges();

    click(fixture, '.log-track-lane[title="fatal"] .log-track-marker');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(textOf(fixture, '.log-detail-panel-position')).toBe('4 of 6');
    expect(countOf(fixture, '.plot-drawing-log-mark-selected')).toBe(2);
    expect(countOf(fixture, '.log-track-mark-selected')).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(textOf(fixture, '.log-detail-panel-position')).toBe('5 of 6');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.json-viewer-search')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.json-viewer-search')).toBeNull();
    expect(elementOf(fixture, '.log-detail-panel')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.log-detail-panel')).toBeNull();
    expect(countOf(fixture, '.plot-drawing-log-mark')).toBe(0);
  });

  it('Escape with the logs setup open closes an open picker first, then the setup', async () => {
    const fixture = await renderPage();
    await TestBed.inject(LogsStore).load(logFileFixture());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    click(fixture, '.log-field-row-trigger');

    expect(countOf(fixture, '.log-field-row-options')).toBe(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(countOf(fixture, '.log-field-row-options')).toBe(0);
    expect(elementOf(fixture, '.log-setup-panel')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.log-setup-panel')).toBeNull();
  });

  it('drops the logs when another analysis is opened in the same workspace', async () => {
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);
    await logs.load(logFileFixture());

    fixture.componentRef.setInput('analysisId', 'a2');
    fixture.detectChanges();

    expect(logs.status()).toBe('none');
  });

  it('Escape while a zoom is being dragged out drops the selection and closes nothing, and the next Escape closes the popover', async () => {
    const fixture = await renderPage();
    const timeWindow = TestBed.inject(TimeWindowStore);

    click(fixture, '.time-nav-dates');
    timeWindow.beginSelection(0.2);
    timeWindow.pointAt(0.6, 's0');
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(timeWindow.selection()).toBeNull();
    expect(elementOf(fixture, 'app-timeframe-popover')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-timeframe-popover')).toBeNull();
  });

  it('takes a log file dropped anywhere on the workspace and opens its setup, saying so while the file hovers, and leaves a dragged chart alone', async () => {
    const fixture = await renderPage();
    const host: HTMLElement = fixture.nativeElement;
    const file = logFileFixture();
    const dragOf = (type: string, dataTransfer: unknown): Event => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer });
    const chartOver = dragOf('dragover', { types: ['text/plain'], files: [] });
    const fileOver = dragOf('dragover', { types: ['Files'], files: [file] });

    elementOf(fixture, '.chart-canvas')?.dispatchEvent(chartOver);
    fixture.detectChanges();

    expect(elementOf(fixture, '.workspace-drop')).toBeNull();

    elementOf(fixture, '.chart-canvas')?.dispatchEvent(fileOver);
    fixture.detectChanges();

    expect(fileOver.defaultPrevented).toBe(true);
    expect(textOf(fixture, '.workspace-drop-hint')).toBe('Drop a JSON, CSV or text log file to place its entries under the charts');

    host.dispatchEvent(dragOf('drop', { types: ['Files'], files: [file] }));
    await vi.waitFor(() => expect(TestBed.inject(LogsStore).recordCount()).toBeGreaterThan(0));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elementOf(fixture, '.workspace-drop')).toBeNull();
    expect(elementOf(fixture, '.log-setup-panel')).not.toBeNull();
  });

  it('writes the time under the cursor once and shows the same on every chart', async () => {
    const fixture = await renderPage();
    const timeWindow = TestBed.inject(TimeWindowStore);

    timeWindow.pointAt(0.5, null);
    fixture.detectChanges();

    const times = elementsOf(fixture, '.chart-crosshair-tip-time').map((time) => time.textContent?.trim());

    expect(times).toHaveLength(2);
    expect(times[0]).toMatch(/^\d\d\/\d\d \d\d:\d\d$/);
    expect(times[1]).toBe(times[0]);
  });

  it('while the window is being slid, leaves the log track as it was and regroups it once the slide rests', async () => {
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);
    const timeWindow = TestBed.inject(TimeWindowStore);
    const { fromMilliseconds } = timeWindow.bounds();

    await logs.load(logFileFixture());
    logs.confirmSetup();
    fixture.detectChanges();
    timeWindow.slideWindow({ fromMilliseconds, untilMilliseconds: fromMilliseconds + MILLISECONDS_PER_HOUR });
    fixture.detectChanges();

    expect(textOf(fixture, '.log-track-in-view')).toBe('6 in view');

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(fixture, '.log-track-in-view')).toBe('0 in view');
    });
    expect(countOf(fixture, '.log-track-marker')).toBe(0);
  });

  it('WorkspacePageComponent walks the findings of a finished run from the keyboard: shading, focus, expansion, the chart and the panel', async () => {
    const fixture = await renderPage();
    const insights = TestBed.inject(InsightsStore);
    await insights.run();
    fixture.detectChanges();

    press(fixture, 'h');

    expect(insights.areOverlaysHidden()).toBe(true);

    press(fixture, 'ArrowDown');

    expect(insights.focusIndex()).toBe(1);

    press(fixture, 'ArrowUp');
    press(fixture, 'Enter');

    expect(insights.focusIndex()).toBe(0);
    expect(insights.isFocusedExpanded()).toBe(false);

    press(fixture, 'Enter');
    press(fixture, 'Escape');

    expect(insights.isFocusedExpanded()).toBe(false);
    expect(insights.isPanelOpen()).toBe(true);

    press(fixture, ' ');

    expect(insights.areOverlaysHidden()).toBe(false);
    expect(insights.flashingFindingId()).toBe('fd0');

    press(fixture, 'Escape');

    expect(insights.isPanelOpen()).toBe(false);

    press(fixture, 'i');
    await fixture.whenStable();

    expect(insights.isPanelOpen()).toBe(true);
  });

  it('WorkspacePageComponent cancels a run still under way on Escape', async () => {
    vi.mocked(gateway.runInsights).mockImplementation(async () => await new Promise(() => undefined));
    const fixture = await renderPage();
    const insights = TestBed.inject(InsightsStore);

    void insights.run();
    await vi.waitFor(() => expect(insights.status()).toBe('running'));
    press(fixture, 'Escape');

    expect(insights.status()).toBe('idle');
  });

  it('WorkspacePageComponent closes on Escape the settings menu, the context menu, the export menu and the series menu, each opened in turn', async () => {
    const fixture = await renderPage();
    const workspace = TestBed.inject(WorkspaceStore);

    click(fixture, '.view-settings-toggle');

    expect(elementOf(fixture, '.view-settings-item')).not.toBeNull();

    press(fixture, 'Escape');

    expect(elementOf(fixture, '.view-settings-item')).toBeNull();

    elementsOf(fixture, '.library-thumbnail')[2]?.dispatchEvent(new MouseEvent('contextmenu', { clientX: 60, clientY: 200, cancelable: true }));
    fixture.detectChanges();

    expect(workspace.contextMenuDetails()).not.toBeNull();

    press(fixture, 'Escape');

    expect(workspace.contextMenuDetails()).toBeNull();

    click(fixture, '.chart-panel-header-export');

    expect(TestBed.inject(ExportStore).menu()).not.toBeNull();

    press(fixture, 'Escape');

    expect(TestBed.inject(ExportStore).menu()).toBeNull();

    TestBed.inject(CanvasDragStore).mergeIntoChart('s2', 's0');
    fixture.detectChanges();
    click(fixture, '.chart-panel-header-series');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(elementOf(fixture, 'app-chart-series-menu')).not.toBeNull();

    press(fixture, 'Escape');

    expect(workspace.seriesMenuDetails()).toBeNull();
    expect(elementOf(fixture, 'app-chart-series-menu')).toBeNull();
  });

  it('WorkspacePageComponent undoes a change to the canvas on Ctrl+Z and redoes it on Ctrl+Y and on Ctrl+Shift+Z', async () => {
    const fixture = await renderPage();
    const workspace = TestBed.inject(WorkspaceStore);

    click(fixture, '.chart-panel-header-remove', 1);
    press(fixture, 'z', { ctrlKey: true });

    expect(workspace.canvas().map(chartIdOf)).toEqual(['s0', 's1']);

    press(fixture, 'y', { ctrlKey: true });

    expect(workspace.canvas().map(chartIdOf)).toEqual(['s0']);

    press(fixture, 'z', { ctrlKey: true });
    press(fixture, 'Z', { ctrlKey: true, shiftKey: true });

    expect(workspace.canvas().map(chartIdOf)).toEqual(['s0']);
  });

  it('WorkspacePageComponent, with a log entry open and searched, steps through the matches on F3 and Shift+F3 and to the entry before on the left arrow', async () => {
    const fixture = await renderPage();
    const logs = TestBed.inject(LogsStore);
    await logs.load(logFileFixture());
    logs.confirmSetup();
    fixture.detectChanges();
    click(fixture, '.log-track-lane[title="fatal"] .log-track-marker');
    await fixture.whenStable();
    fixture.detectChanges();
    press(fixture, 'f', { ctrlKey: true });
    typeInto(fixture, '.json-viewer-search-field input', 'a');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(textOf(fixture, '.json-viewer-search-counter')).toMatch(/^1 of \d+$/);
    });

    press(fixture, 'F3');

    expect(textOf(fixture, '.json-viewer-search-counter')).toMatch(/^2 of \d+$/);

    press(fixture, 'F3', { shiftKey: true });

    expect(textOf(fixture, '.json-viewer-search-counter')).toMatch(/^1 of \d+$/);

    press(fixture, 'ArrowLeft');

    expect(textOf(fixture, '.log-detail-panel-position')).toBe('3 of 6');
  });

  it('WorkspacePageComponent answers a key pressed before it has drawn anything by doing nothing', () => {
    const fixture = TestBed.createComponent(WorkspacePageComponent);
    fixture.componentRef.setInput('analysisId', 'a1');
    const earlyEscape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });

    document.dispatchEvent(earlyEscape);

    expect(earlyEscape.defaultPrevented).toBe(false);
  });

  it('WorkspacePageComponent remembers the library filter committed and forgets it once asked to from the recent filters', async () => {
    const fixture = await renderPage();
    const field = elementOf(fixture, '.chart-library-filter input');

    typeInto(fixture, '.chart-library-filter input', 'cpu');
    fixture.detectChanges();
    field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(gateway.rememberSearch).toHaveBeenCalledWith('chart-library', 'cpu'));
    await fixture.whenStable();

    typeInto(fixture, '.chart-library-filter input', '');
    fixture.detectChanges();
    field?.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    elementOf(fixture, '.search-field-history-forget')?.click();

    await vi.waitFor(() => expect(gateway.forgetSearch).toHaveBeenCalledWith('chart-library', 'cpu'));
  });

  it('WorkspacePageComponent applies a whole quick count from the popover and closes it', async () => {
    const fixture = await renderPage();

    click(fixture, '.time-nav-dates');
    typeInto(fixture, '.quick-select-count', '6');
    fixture.detectChanges();
    click(fixture, '.quick-select-apply');

    expect(TestBed.inject(TimeWindowStore).timeframeLabel()).toBe('Last 6 hours');
    expect(elementOf(fixture, 'app-timeframe-popover')).toBeNull();
  });

  it('WorkspacePageComponent keeps the popover open when the quick count it is asked to apply is one the window refuses', async () => {
    const fixture = await renderPage();
    const before = TestBed.inject(TimeWindowStore).window();

    click(fixture, '.time-nav-dates');
    typeInto(fixture, '.quick-select-count', 'a few');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('app-timeframe-editor')).triggerEventHandler('trailingCountApplied');
    fixture.detectChanges();

    expect(TestBed.inject(TimeWindowStore).window()).toBe(before);
    expect(elementOf(fixture, 'app-timeframe-popover')).not.toBeNull();
  });

  it('WorkspacePageComponent puts the cursor of a pointer on a chart on every chart while crosshairs are shared, and on that chart alone otherwise', async () => {
    const fixture = await renderPage();
    const timeWindow = TestBed.inject(TimeWindowStore);
    const settings = TestBed.inject(SettingsStore);
    const overlay = elementsOf(fixture, '.chart-panel-overlay')[1];

    if (overlay !== undefined) {
      vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 1000,
        height: 100,
        right: 1000,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => '',
      });
    }

    overlay?.dispatchEvent(new PointerEvent('pointerenter'));
    overlay?.dispatchEvent(new PointerEvent('pointermove', { clientX: 500 }));

    expect(timeWindow.cursor()).toEqual({ fraction: 0.5, chartId: null });

    settings.toggleSynchronizedCrosshair();
    fixture.detectChanges();
    timeWindow.leavePlot();
    overlay?.dispatchEvent(new PointerEvent('pointerenter'));

    expect(timeWindow.cursor()).toEqual({ fraction: 0, chartId: 's1' });

    overlay?.dispatchEvent(new PointerEvent('pointermove', { clientX: 500 }));

    expect(timeWindow.cursor()).toEqual({ fraction: 0.5, chartId: 's1' });
  });

  it('WorkspacePageComponent marks the chart a dragged chart is held over as its drop target', async () => {
    const fixture = await renderPage();
    const canvasDrag = TestBed.inject(CanvasDragStore);
    canvasDrag.beginDrag('s3');
    await vi.waitFor(() => expect(canvasDrag.isDragging()).toBe(true));
    fixture.detectChanges();

    elementsOf(fixture, '.chart-panel')[1]?.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true }));

    expect(canvasDrag.dropTarget()?.chartId).toBe('s1');
  });

  it('WorkspacePageComponent opens the colour menu of a series from its chart and recolours the series with the colour chosen', async () => {
    const fixture = await renderPage();
    const workspace = TestBed.inject(WorkspaceStore);

    click(fixture, '.color-picker-swatch');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(workspace.colorMenuDetails()?.seriesId).toBe('s0');

    click(fixture, '.color-palette-choice', 3);

    expect(workspace.colorMenuDetails()).toBeNull();
    await vi.waitFor(() => expect(gateway.saveSeriesColor).toHaveBeenCalled());
  });

  it('WorkspacePageComponent keeps saying a log file may be dropped while the drag only crosses into the page, and stops once it leaves', async () => {
    const fixture = await renderPage();
    const host: HTMLElement = fixture.nativeElement;

    const leaveAt = (clientX: number): void => {
      host.dispatchEvent(dragEventOf('dragleave', { clientX, clientY: 100 }, null));
      fixture.detectChanges();
    };

    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1200,
      height: 800,
      right: 1200,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => '',
    });
    host.dispatchEvent(dragEventOf('dragover', { cancelable: true }, { types: ['Files'], files: [] }));
    fixture.detectChanges();
    leaveAt(600);

    expect(elementOf(fixture, '.workspace-drop')).not.toBeNull();

    leaveAt(1300);

    expect(elementOf(fixture, '.workspace-drop')).toBeNull();
  });

  it('WorkspacePageComponent, for a drop that carries no file, only takes the hint away', async () => {
    const fixture = await renderPage();
    const host: HTMLElement = fixture.nativeElement;
    const drop = dragEventOf('drop', { cancelable: true }, { types: [], files: [] });

    host.dispatchEvent(dragEventOf('dragover', { cancelable: true }, { types: ['Files'], files: [] }));
    fixture.detectChanges();
    host.dispatchEvent(drop);
    fixture.detectChanges();

    expect(drop.defaultPrevented).toBe(false);
    expect(elementOf(fixture, '.workspace-drop')).toBeNull();
    expect(TestBed.inject(LogsStore).status()).toBe('none');
  });

  it('WorkspacePageComponent, compiled again from its own metadata as a TestBed override compiles it, still closes the analysis menu on Escape', async () => {
    TestBed.overrideComponent(WorkspacePageComponent, { set: {} });
    await TestBed.compileComponents();
    const fixture = await renderPage();

    click(fixture, '.analysis-title-menu-toggle');
    press(fixture, 'Escape');

    expect(elementOf(fixture, 'app-analysis-title .menu-option')).toBeNull();
  });
});
