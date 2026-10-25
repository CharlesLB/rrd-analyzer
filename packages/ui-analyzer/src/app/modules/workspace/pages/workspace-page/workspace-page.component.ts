import { ChangeDetectionStrategy, Component, computed, DOCUMENT, effect, inject, input, signal, untracked, viewChild, viewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { formatMessage } from '@rrd-analyzer/shared';
import { useMediaQuery } from '@rrd-analyzer/ui-shared';
import * as R from 'remeda';
import { AnchoredMenuComponent } from '../../../../shared/components/anchored-menu/anchored-menu.component';
import { ColorPaletteComponent } from '../../../../shared/components/color-palette/color-palette.component';
import { currentViewport } from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import { formatShortTimestamp } from '../../../../shared/utils/date-format/date-format.util';
import { carriesFiles, firstDroppedFileOf, hasLeftTarget } from '../../../../shared/utils/drag-transfer/drag-transfer.util';
import { type ExportMenuRequest, placeExportMenu } from '../../../../stores/export/models/export-menu/export-menu';
import { ExportStore } from '../../../../stores/export/store/export-store/export.store';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { InsightsStore } from '../../../../stores/insights/store/insights-store/insights.store';
import { colorOfType } from '../../../../stores/logs/models/log-severity/log-severity';
import { LOG_STATUSES, STEP_DIRECTIONS } from '../../../../stores/logs/models/log-state/log-state';
import { LogsStore } from '../../../../stores/logs/store/logs-store/logs.store';
import { SampleAnalysisStore } from '../../../../stores/sample-analysis/store/sample-analysis-store/sample-analysis.store';
import { SEARCH_FIELDS } from '../../../../stores/search-history/models/search-field/search-field';
import { SearchHistoryStore } from '../../../../stores/search-history/store/search-history-store/search-history.store';
import { SettingsStore } from '../../../../stores/settings/store/settings-store/settings.store';
import { ABSOLUTE_OUTCOMES } from '../../../../stores/time-window/models/absolute-time/absolute-time';
import { TimeWindowStore } from '../../../../stores/time-window/store/time-window-store/time-window.store';
import { COLOR_MENU_WIDTH, type ColorMenuRequest, placeColorMenu } from '../../../../stores/workspace/models/color-menu/color-menu';
import { type ContextMenuRequest, placeContextMenu } from '../../../../stores/workspace/models/context-menu/context-menu';
import { placeSeriesMenu, type SeriesMenuRequest } from '../../../../stores/workspace/models/series-menu/series-menu';
import {
  DEFAULT_QUICK_COUNT,
  instantAt,
  QUICK_UNITS,
  type QuickUnit,
  TIMEFRAME_TABS,
  type TimeframeTab,
  type TimestampRange,
  timestampRangeOf,
} from '../../../../stores/workspace/models/timeframe/timeframe';
import { CanvasDragStore } from '../../../../stores/workspace/store/canvas-drag-store/canvas-drag.store';
import { SeriesDataStore } from '../../../../stores/workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../../stores/workspace/store/workspace-store/workspace.store';
import { AnalysisTitleComponent } from '../../components/analysis-title/analysis-title.component';
import { AnalysisUnavailableComponent } from '../../components/analysis-unavailable/analysis-unavailable.component';
import { ChartCanvasComponent } from '../../components/chart-canvas/chart-canvas.component';
import { ChartLibraryComponent } from '../../components/chart-library/chart-library.component';
import { ChartPanelComponent, type DropTargetUpdate } from '../../components/chart-panel/chart-panel.component';
import { ChartSeriesMenuComponent } from '../../components/chart-series-menu/chart-series-menu.component';
import { ContextMenuComponent } from '../../components/context-menu/context-menu.component';
import { ExportMenuComponent } from '../../components/export-menu/export-menu.component';
import { InsightsPanelComponent } from '../../components/insights-panel/insights-panel.component';
import { InsightsTriggerComponent } from '../../components/insights-trigger/insights-trigger.component';
import { LibraryStripComponent } from '../../components/library-strip/library-strip.component';
import { LibraryStripCardComponent } from '../../components/library-strip-card/library-strip-card.component';
import { LogDetailPanelComponent } from '../../components/log-detail-panel/log-detail-panel.component';
import { LogSetupPanelComponent } from '../../components/log-setup-panel/log-setup-panel.component';
import { LogTrackComponent } from '../../components/log-track/log-track.component';
import { LogsTriggerComponent } from '../../components/logs-trigger/logs-trigger.component';
import { TimeNavComponent } from '../../components/time-nav/time-nav.component';
import { TimeframeBarComponent } from '../../components/timeframe-bar/timeframe-bar.component';
import { TimeframeEditorComponent } from '../../components/timeframe-editor/timeframe-editor.component';
import { TimelineStripComponent } from '../../components/timeline-strip/timeline-strip.component';
import { ViewSettingsComponent } from '../../components/view-settings/view-settings.component';
import { COMPACT_LAYOUT_QUERY } from '../../models/compact-layout/compact-layout';
import { insightOverlaysOf, NO_OVERLAYS } from '../../models/insight-overlay/insight-overlay';
import {
  type PerformedShortcut,
  SHORTCUT_ACTIONS,
  type ShortcutState,
  shortcutActionOf,
  shortcutKeyOf,
} from '../../models/keyboard-shortcut/keyboard-shortcut';
import { logMarksOf } from '../../models/log-mark/log-mark';
import { SHORTCUT_COMBINATIONS, shortcutLabelOf, usesAppleKeys } from '../../models/shortcut-label/shortcut-label';

const MENU_ROUTE = '/';
const TIMEFRAME_POPOVER_WIDTH = 432;
const TIMEFRAME_POPOVER_MINIMUM_LEFT = 12;

@Component({
  selector: 'app-workspace-page',
  imports: [
    AnchoredMenuComponent,
    ColorPaletteComponent,
    AnalysisTitleComponent,
    AnalysisUnavailableComponent,
    ChartCanvasComponent,
    ChartLibraryComponent,
    ChartPanelComponent,
    ChartSeriesMenuComponent,
    ContextMenuComponent,
    ExportMenuComponent,
    InsightsPanelComponent,
    InsightsTriggerComponent,
    LibraryStripCardComponent,
    LibraryStripComponent,
    LogDetailPanelComponent,
    LogSetupPanelComponent,
    LogsTriggerComponent,
    LogTrackComponent,
    TimeframeBarComponent,
    TimeNavComponent,
    TimelineStripComponent,
    TimeframeEditorComponent,
    ViewSettingsComponent,
  ],
  templateUrl: './workspace-page.component.html',
  styleUrl: './workspace-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'respondToShortcut($event)',
    '(window:focus)': 'insights.checkConfiguration()',
    '(dragover)': 'aimLogFile($event)',
    '(dragleave)': 'leaveLogFile($event)',
    '(drop)': 'dropLogFile($event)',
  },
})
export class WorkspacePageComponent {
  public readonly analysisId = input.required<string>();

  private readonly _router = inject(Router);
  private readonly _title = viewChild.required(AnalysisTitleComponent);
  private readonly _viewSettings = viewChild.required(ViewSettingsComponent);
  private readonly _logSetup = viewChild(LogSetupPanelComponent);
  private readonly _logDetail = viewChild(LogDetailPanelComponent);
  private readonly _strip = viewChild(TimelineStripComponent);
  private readonly _panels = viewChildren(ChartPanelComponent);
  private readonly _searchHistory = inject(SearchHistoryStore);
  private readonly _sampleAnalysis = inject(SampleAnalysisStore);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly colorMenuWidth = COLOR_MENU_WIDTH;
  protected readonly pickingSeriesId = computed(() => this.workspace.colorMenuDetails()?.seriesId ?? null);
  protected readonly workspace = inject(WorkspaceStore);
  protected readonly seriesData = inject(SeriesDataStore);
  protected readonly canvasDrag = inject(CanvasDragStore);
  protected readonly timeWindow = inject(TimeWindowStore);
  protected readonly insights = inject(InsightsStore);
  protected readonly logs = inject(LogsStore);
  protected readonly canvasExport = inject(ExportStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly libraryFilterHistory = computed(() => this._searchHistory.histories()[SEARCH_FIELDS.CHART_LIBRARY]);
  protected readonly isCompact = useMediaQuery(COMPACT_LAYOUT_QUERY);

  private readonly _usesAppleKeys = usesAppleKeys(inject(DOCUMENT).defaultView?.navigator);

  protected readonly isTimeframeOpen = signal(false);
  protected readonly isLogFileAimed = signal(false);
  protected readonly timeframeLeftOffset = signal(TIMEFRAME_POPOVER_MINIMUM_LEFT);
  protected readonly timeframeTab = signal<TimeframeTab>(TIMEFRAME_TABS.QUICK);
  protected readonly quickCount = signal(DEFAULT_QUICK_COUNT);
  protected readonly quickUnit = signal<QuickUnit>(QUICK_UNITS.HOURS);

  protected readonly chartPanels = computed(() => {
    const target = this.canvasDrag.dropTarget();
    const heights = this.workspace.chartHeights();

    return R.map(this.seriesData.canvasCharts(), (chart) => ({
      chart,
      dropPosition: target?.chartId === chart.id ? target.position : null,
      isExportMenuOpen: this.canvasExport.menuChartId() === chart.id,
      isSeriesMenuOpen: this.workspace.seriesMenuChartId() === chart.id,
      height: heights[chart.id] ?? null,
    }));
  });

  protected readonly chartHeights = computed(() => {
    const heights = this.workspace.chartHeights();

    return R.map(this.seriesData.canvasCharts(), (chart) => heights[chart.id] ?? null);
  });

  protected readonly overlays = computed(() => {
    const findings = this.insights.overlaidFindings();

    return findings.length === 0
      ? NO_OVERLAYS
      : insightOverlaysOf(findings, this.timeWindow.window(), {
          isPanelOpen: this.insights.isPanelOpen(),
          hoveredFindingId: this.insights.hoveredFindingId(),
          flashingFindingId: this.insights.flashingFindingId(),
        });
  });

  protected readonly logShortcutLabels = {
    find: shortcutLabelOf(SHORTCUT_COMBINATIONS.FIND, this._usesAppleKeys),
    previousMatch: shortcutLabelOf(SHORTCUT_COMBINATIONS.PREVIOUS_MATCH, this._usesAppleKeys),
  };

  private readonly _isTimeframeAdjusted = signal(false);

  protected readonly timeframeNotice = computed(() =>
    this._isTimeframeAdjusted() ? formatMessage(this.texts().timeframePopover.adjustedToData, timestampRangeOf(this.timeWindow.window())) : '',
  );

  protected readonly cursorTime = computed(() => {
    const cursor = this.timeWindow.cursor();

    return cursor === null ? '' : formatShortTimestamp(instantAt(this.timeWindow.window(), cursor.fraction));
  });

  protected readonly logEntryCount = computed(() => (this.logs.status() === LOG_STATUSES.READY ? this.logs.entries().length : null));
  protected readonly logCursorFraction = computed(() => this.timeWindow.cursor()?.fraction ?? null);

  protected readonly openLogDetail = computed(() => {
    const entry = this.logs.selectedEntry();

    return entry !== null && this.logs.isDetailOpen() ? { entry, color: colorOfType(this.logs.typeColors(), entry.type) } : null;
  });

  protected readonly logMarks = computed(() =>
    logMarksOf(
      { hovered: this.logs.hoveredEntry(), selected: this.logs.isDetailOpen() ? this.logs.selectedEntry() : null },
      this.timeWindow.window(),
      this.logs.typeColors(),
    ),
  );

  private readonly _shortcutState = computed<ShortcutState>(() => ({
    status: this.insights.status(),
    isPanelOpen: this.insights.isPanelOpen(),
    hasFindings: this.insights.findings().length > 0,
    isFocusedExpanded: this.insights.isFocusedExpanded(),
    isTimeframeOpen: this.isTimeframeOpen(),
    isContextMenuOpen: this.workspace.contextMenuDetails() !== null,
    isExportMenuOpen: this.canvasExport.menuDetails() !== null,
    isSeriesMenuOpen: this.workspace.seriesMenuDetails() !== null,
    isTitleMenuOpen: this._title().isMenuOpen(),
    isSettingsMenuOpen: this._viewSettings().isMenuOpen(),
    logPanel: this.logs.panel(),
    isLogSearchOpen: this._logDetail()?.isSearchOpen() ?? false,
    isLogPickerOpen: this._logSetup()?.isPickerOpen() ?? false,
    isDragUnderWay: (this._strip()?.isHeld() ?? false) || this.timeWindow.selection() !== null || this._panels().some((panel) => panel.isResizing()),
  }));

  private readonly _shortcutHandlers: Readonly<Record<PerformedShortcut, () => void>> = {
    [SHORTCUT_ACTIONS.RUN_INSIGHTS]: () => void this.insights.run(),
    [SHORTCUT_ACTIONS.TOGGLE_PANEL]: () => void this.insights.togglePanel(),
    [SHORTCUT_ACTIONS.TOGGLE_OVERLAYS]: () => this.insights.toggleOverlays(),
    [SHORTCUT_ACTIONS.FOCUS_NEXT]: () => this.insights.focusNext(),
    [SHORTCUT_ACTIONS.FOCUS_PREVIOUS]: () => this.insights.focusPrevious(),
    [SHORTCUT_ACTIONS.TOGGLE_FOCUSED]: () => this.insights.toggleFocused(),
    [SHORTCUT_ACTIONS.SHOW_FOCUSED]: () => this.insights.showFocusedOnChart(),
    [SHORTCUT_ACTIONS.COLLAPSE_FOCUSED]: () => this.insights.collapseFocused(),
    [SHORTCUT_ACTIONS.CLOSE_PANEL]: () => this.insights.closePanel(),
    [SHORTCUT_ACTIONS.CANCEL_RUN]: () => this.insights.cancel(),
    [SHORTCUT_ACTIONS.CLOSE_TIMEFRAME]: () => this.closeTimeframe(),
    [SHORTCUT_ACTIONS.CLOSE_TITLE_MENU]: () => this._title().closeMenu(),
    [SHORTCUT_ACTIONS.CLOSE_SETTINGS_MENU]: () => this._viewSettings().closeMenu(),
    [SHORTCUT_ACTIONS.CLOSE_CONTEXT_MENU]: () => this.workspace.closeContextMenu(),
    [SHORTCUT_ACTIONS.CLOSE_EXPORT_MENU]: () => this.canvasExport.closeMenu(),
    [SHORTCUT_ACTIONS.CLOSE_SERIES_MENU]: () => this.workspace.closeSeriesMenu(),
    [SHORTCUT_ACTIONS.UNDO_CANVAS]: () => this.workspace.undoCanvas(),
    [SHORTCUT_ACTIONS.REDO_CANVAS]: () => this.workspace.redoCanvas(),
    [SHORTCUT_ACTIONS.OPEN_LOG_SEARCH]: () => this._logDetail()?.openSearch(),
    [SHORTCUT_ACTIONS.NEXT_LOG_MATCH]: () => this._logDetail()?.stepMatch(STEP_DIRECTIONS.FORWARD),
    [SHORTCUT_ACTIONS.PREVIOUS_LOG_MATCH]: () => this._logDetail()?.stepMatch(STEP_DIRECTIONS.BACKWARD),
    [SHORTCUT_ACTIONS.NEXT_LOG_ENTRY]: () => this.logs.step(STEP_DIRECTIONS.FORWARD),
    [SHORTCUT_ACTIONS.PREVIOUS_LOG_ENTRY]: () => this.logs.step(STEP_DIRECTIONS.BACKWARD),
    [SHORTCUT_ACTIONS.CLOSE_LOG_SEARCH]: () => this._logDetail()?.closeSearch(),
    [SHORTCUT_ACTIONS.CLOSE_LOG_DETAIL]: () => this.logs.closeDetail(),
    [SHORTCUT_ACTIONS.CLOSE_LOG_PICKER]: () => this._logSetup()?.closePicker(),
    [SHORTCUT_ACTIONS.CLOSE_LOG_SETUP]: () => this.logs.cancelSetup(),
    [SHORTCUT_ACTIONS.CANCEL_DRAG]: () => this._cancelDrag(),
  };

  public constructor() {
    void this._searchHistory.load(SEARCH_FIELDS.CHART_LIBRARY);

    effect(() => {
      const analysisId = this.analysisId();

      untracked(() => {
        this.logs.clear();
        void this._open(analysisId);
      });
    });
  }

  protected rememberLibraryFilter(term: string): void {
    void this._searchHistory.remember(SEARCH_FIELDS.CHART_LIBRARY, term);
  }

  protected forgetLibraryFilter(term: string): void {
    void this._searchHistory.forget(SEARCH_FIELDS.CHART_LIBRARY, term);
  }

  protected async backToMenu(): Promise<void> {
    await this._router.navigateByUrl(MENU_ROUTE);
  }

  protected toggleTimeframe(anchorOffsetRight: number): void {
    this._isTimeframeAdjusted.set(false);
    this.timeframeLeftOffset.set(Math.max(TIMEFRAME_POPOVER_MINIMUM_LEFT, anchorOffsetRight - TIMEFRAME_POPOVER_WIDTH));
    this.isTimeframeOpen.update((isOpen) => !isOpen);
  }

  protected closeTimeframe(): void {
    this._isTimeframeAdjusted.set(false);
    this.isTimeframeOpen.set(false);
  }

  protected applyQuickCount(): void {
    if (this.timeWindow.showTrailingCount(this.quickCount(), this.quickUnit())) {
      this.closeTimeframe();
    }
  }

  protected choosePreset(milliseconds: number): void {
    this.timeWindow.showTrailing(milliseconds);
    this.isTimeframeOpen.set(false);
  }

  protected applyAbsolute(range: TimestampRange): void {
    const outcome = this.timeWindow.showAbsolute(range.from, range.to);

    this._isTimeframeAdjusted.set(outcome === ABSOLUTE_OUTCOMES.ADJUSTED);

    if (outcome === ABSOLUTE_OUTCOMES.APPLIED) {
      this.closeTimeframe();
    }
  }

  protected openContextMenu(request: ContextMenuRequest): void {
    this.workspace.openContextMenu(placeContextMenu(request, currentViewport(), this.workspace.mergeTargetsFor(request.seriesId).length));
  }

  protected pointAtChart(chartId: string, fraction: number): void {
    this.timeWindow.pointAt(fraction, this.settings.synchronizedCrosshair() ? null : chartId);
  }

  protected enterChart(chartId: string): void {
    this.timeWindow.enterChart(chartId, this.settings.synchronizedCrosshair());
  }

  protected trackDropTarget(update: DropTargetUpdate): void {
    this.canvasDrag.trackDropTarget(update.chartId, update.verticalFraction);
  }

  protected openExportMenu(request: ExportMenuRequest): void {
    this.canvasExport.toggleMenu(placeExportMenu(request, currentViewport()));
  }

  protected openSeriesMenu(request: SeriesMenuRequest): void {
    this.workspace.toggleSeriesMenu(placeSeriesMenu(request, currentViewport()));
  }

  protected openColorMenu(request: ColorMenuRequest): void {
    this.workspace.toggleColorMenu(placeColorMenu(request, currentViewport()));
  }

  protected aimLogFile(event: DragEvent): void {
    if (carriesFiles(event)) {
      event.preventDefault();
      this.isLogFileAimed.set(true);
    }
  }

  protected leaveLogFile(event: DragEvent): void {
    if (hasLeftTarget(event)) {
      this.isLogFileAimed.set(false);
    }
  }

  protected dropLogFile(event: DragEvent): void {
    const file = firstDroppedFileOf(event);

    this.isLogFileAimed.set(false);

    if (file !== null) {
      event.preventDefault();
      void this.logs.load(file);
    }
  }

  protected respondToShortcut(event: KeyboardEvent): void {
    const action = shortcutActionOf(shortcutKeyOf(event), this._shortcutState());

    if (action === SHORTCUT_ACTIONS.NONE) {
      return;
    }

    event.preventDefault();
    this._shortcutHandlers[action]();
  }

  private async _open(analysisId: string): Promise<void> {
    await this.workspace.open(analysisId);

    const sampleLog = await this._sampleAnalysis.logToOpenWith(analysisId);

    if (sampleLog !== null && this.analysisId() === analysisId && (await this.logs.load(sampleLog))) {
      this.logs.confirmSetup();
    }
  }

  private _cancelDrag(): void {
    this._strip()?.cancelGesture();
    this.timeWindow.cancelSelection();
    this._panels().forEach((panel) => {
      panel.cancelResize();
    });
  }
}
