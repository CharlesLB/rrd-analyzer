import type { PluralForms } from '../plural/plural';

export type ApplicationMessages = {
  readonly name: string;
  readonly libraryTitle: string;
  readonly workspaceTitle: string;
  readonly toggleTheme: string;
  readonly dismissToast: string;
  readonly listSeparator: string;
  readonly mergedSeparator: string;
  readonly versionTitle: string;
};

export type UnitMessages = {
  readonly emptyValue: string;
  readonly unitless: string;
  readonly seconds: string;
  readonly minutes: string;
  readonly hours: string;
  readonly days: string;
  readonly bytes: string;
  readonly kilobytes: string;
  readonly megabytes: string;
};

export type CalendarMessages = {
  readonly monthNames: readonly string[];
  readonly monthAbbreviations: readonly string[];
  readonly weekdayInitials: readonly string[];
  readonly previousMonth: string;
  readonly nextMonth: string;
};

export type RelativeTimeMessages = {
  readonly justNow: string;
  readonly minutesAgo: string;
  readonly hoursAgo: string;
  readonly yesterday: string;
  readonly daysAgo: string;
};

export type LibraryMessages = {
  readonly previousAnalysesCaption: string;
  readonly analysisMeta: PluralForms;
  readonly emptyCanvasMeta: string;
  readonly openAnalysis: string;
  readonly deleteAnalysis: string;
  readonly analysisDeleted: string;
  readonly undoDelete: string;
  readonly untitledAnalysis: string;
  readonly unsupportedSource: string;
  readonly unsupportedSkipped: PluralForms;
  readonly sourcesAlreadyListed: PluralForms;
  readonly dialogUnavailable: string;
  readonly loadFailed: string;
  readonly retryLoad: string;
  readonly loading: string;
  readonly noAnalyses: string;
  readonly filterPlaceholder: string;
  readonly noMatches: string;
  readonly createFailed: string;
  readonly deleteFailed: string;
  readonly sourcesUnreadable: string;
  readonly missingSources: PluralForms;
  readonly missingSourcesTip: string;
};

export type NewAnalysisCardMessages = {
  readonly title: string;
  readonly subtitle: string;
  readonly action: string;
};

export type NewAnalysisDialogMessages = {
  readonly title: string;
  readonly helper: string;
  readonly close: string;
  readonly nameLabel: string;
  readonly namePlaceholder: string;
  readonly sourcesLabel: string;
  readonly dropTitle: string;
  readonly dropSubtitle: string;
  readonly fileCount: PluralForms;
  readonly removeAll: string;
  readonly removeSource: string;
  readonly empty: string;
  readonly emptyHint: string;
  readonly readyHint: PluralForms;
  readonly cancel: string;
  readonly create: string;
  readonly creating: string;
};

export type TimeframeBarMessages = {
  readonly backToMenu: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly windowPosition: string;
  readonly durationAndStep: string;
  readonly absoluteRange: string;
};

export type AnalysisTitleMessages = {
  readonly rename: string;
  readonly nameLabel: string;
  readonly menu: string;
  readonly sourcesTag: string;
  readonly sourcesTitle: string;
  readonly sourcesDetail: PluralForms;
  readonly addSourcesTag: string;
  readonly addSourcesTitle: string;
  readonly addSourcesDetail: string;
};

export type ViewSettingsMessages = {
  readonly menu: string;
  readonly thumbnailFill: string;
  readonly synchronizedCrosshair: string;
  readonly logLanes: string;
};

export type TimeNavMessages = {
  readonly pickDates: string;
  readonly shiftBack: string;
  readonly shiftForward: string;
  readonly backOneDay: string;
  readonly forwardOneDay: string;
  readonly startOfData: string;
  readonly endOfData: string;
  readonly filesBegin: string;
  readonly filesEnd: string;
  readonly shiftedRange: string;
};

export type BrowserEditionMessages = {
  readonly label: string;
  readonly privacy: string;
  readonly offlineDownload: string;
};

export type WindowControlsMessages = {
  readonly minimise: string;
  readonly maximise: string;
  readonly restore: string;
  readonly close: string;
};

export type TimeUnitMessages = {
  readonly minutes: string;
  readonly hours: string;
  readonly days: string;
};

export type QuickPresetMessages = {
  readonly last15Minutes: string;
  readonly last30Minutes: string;
  readonly last1Hour: string;
  readonly last6Hours: string;
  readonly last12Hours: string;
  readonly last24Hours: string;
  readonly last7Days: string;
  readonly last30Days: string;
  readonly last3Months: string;
};

export type TimeframePopoverMessages = {
  readonly quickTab: string;
  readonly absoluteTab: string;
  readonly lastLabel: string;
  readonly apply: string;
  readonly commonlyUsed: string;
  readonly units: TimeUnitMessages;
  readonly presets: QuickPresetMessages;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly fromPlaceholder: string;
  readonly toPlaceholder: string;
  readonly pickHint: string;
  readonly dataBounds: string;
  readonly invalidFormat: string;
  readonly toBeforeFrom: string;
  readonly adjustedToData: string;
  readonly invalidCount: string;
};

export type ChartLibraryMessages = {
  readonly filterPlaceholder: string;
  readonly caption: string;
  readonly count: string;
  readonly noMatches: string;
  readonly collapse: string;
  readonly expand: string;
  readonly onCanvasTip: string;
  readonly toggleCanvas: string;
};

export type ContextMenuMessages = {
  readonly chartHeading: string;
  readonly openChart: string;
  readonly addToCanvas: string;
  readonly mergeHeading: string;
  readonly mergeWith: string;
  readonly libraryHeading: string;
  readonly moveToTop: string;
  readonly removeFromCanvas: string;
};

export type CanvasMessages = {
  readonly emptyTitle: string;
  readonly emptyHint: string;
  readonly resizeChart: string;
  readonly merge: string;
  readonly addHere: string;
  readonly removeChart: string;
  readonly changeColor: string;
  readonly noData: string;
};

export type StatisticsMessages = {
  readonly minimum: string;
  readonly average: string;
  readonly maximum: string;
  readonly percentile95: string;
  readonly current: string;
  readonly noData: string;
  readonly unitWithGaps: string;
  readonly showLine: string;
  readonly hideLine: string;
};

export type SeriesMenuMessages = {
  readonly buttonLabel: string;
  readonly buttonTip: string;
  readonly caption: string;
  readonly axis: string;
  readonly newAxis: string;
  readonly separate: string;
};

export type AnalysisUnavailableMessages = {
  readonly title: string;
  readonly missingSources: PluralForms;
  readonly missingSourcesHint: string;
  readonly unexplainedHint: string;
  readonly retry: string;
  readonly backToLibrary: string;
};

export type WorkspaceMessages = {
  readonly addedToCanvas: string;
  readonly alreadyOnCanvas: string;
  readonly removedFromCanvas: string;
  readonly chartSeriesLimit: string;
  readonly chartsMerged: string;
  readonly undo: string;
  readonly redo: string;
  readonly csvExported: PluralForms;
  readonly nothingToExport: string;
  readonly seriesUnavailable: string;
  readonly canvasNotSaved: string;
  readonly libraryOrderNotSaved: string;
  readonly seriesColorNotSaved: string;
  readonly timeframeEditorUnavailable: string;
  readonly insightsPanelUnavailable: string;
  readonly contextMenuUnavailable: string;
  readonly exportMenuUnavailable: string;
  readonly seriesMenuUnavailable: string;
  readonly colorMenuUnavailable: string;
  readonly analysisNotRenamed: string;
  readonly sourcesAdded: PluralForms;
  readonly sourcesAlreadyListed: string;
  readonly sourcesNotAdded: string;
};

export type ExportFormatMessages = {
  readonly tag: string;
  readonly title: string;
  readonly detail: string;
};

export type ExportDocumentMessages = {
  readonly range: string;
  readonly chartCount: string;
  readonly seriesSummary: string;
  readonly seriesWithoutData: string;
  readonly findingsShaded: PluralForms;
  readonly samplesPerSeries: string;
  readonly exportedAt: string;
  readonly noteSeparator: string;
};

export type ExportMessages = {
  readonly buttonLabel: string;
  readonly buttonTip: string;
  readonly scope: string;
  readonly scopeWithFindings: string;
  readonly png: ExportFormatMessages;
  readonly copy: ExportFormatMessages;
  readonly svg: ExportFormatMessages;
  readonly csv: ExportFormatMessages;
  readonly csvMergedDetail: string;
  readonly allChartsIcon: string;
  readonly allCharts: string;
  readonly rendering: string;
  readonly pngExported: string;
  readonly pngFailed: string;
  readonly svgExported: string;
  readonly svgExportedShaded: PluralForms;
  readonly copied: string;
  readonly copyBlocked: string;
  readonly clipboardUnavailable: string;
  readonly saveFailed: string;
  readonly csvEmpty: string;
  readonly sourcesExported: PluralForms;
  readonly sourcesFailed: string;
  readonly document: ExportDocumentMessages;
};

export type SeverityMessages = {
  readonly critical: string;
  readonly warning: string;
  readonly info: string;
};

export type InsightsMessages = {
  readonly runLabel: string;
  readonly runTip: string;
  readonly keyHint: string;
  readonly stages: readonly string[];
  readonly stageLabel: string;
  readonly stageStep: string;
  readonly cancelTip: string;
  readonly findingCount: PluralForms;
  readonly noFindings: string;
  readonly staleTip: string;
  readonly toggleTip: string;
  readonly shownTip: string;
  readonly panelTitle: string;
  readonly beta: string;
  readonly betaTip: string;
  readonly rankedCount: string;
  readonly close: string;
  readonly scopeLabel: string;
  readonly scopeAll: string;
  readonly scopeViewport: string;
  readonly ranAt: string;
  readonly rerunTip: string;
  readonly hideOnCharts: string;
  readonly showOnCharts: string;
  readonly hideOnChartsTip: string;
  readonly showOnChartsTip: string;
  readonly staleBanner: string;
  readonly staleConfigurationBanner: string;
  readonly rerun: string;
  readonly unclassified: PluralForms;
  readonly classificationNote: string;
  readonly severities: SeverityMessages;
  readonly inferredTip: string;
  readonly evidenceCount: string;
  readonly gapSpan: string;
  readonly jumpTip: string;
  readonly plotSeries: string;
  readonly showOnChart: string;
  readonly noIssues: string;
  readonly analyzedAll: string;
  readonly analyzedViewport: string;
  readonly runFailed: string;
};

export type LogFailureMessages = {
  readonly empty: string;
  readonly invalidJson: string;
  readonly invalidJsonNearLine: string;
  readonly noObjects: string;
  readonly noObjectsDetail: PluralForms;
  readonly emptyArray: string;
  readonly tooLarge: string;
  readonly unreadable: string;
  readonly unreadableDetail: string;
  readonly noCsvRows: string;
  readonly noDatedLines: string;
};

export type LogNoteMessages = {
  readonly arrayProperty: string;
  readonly skippedLines: PluralForms;
  readonly skippedValues: PluralForms;
  readonly undatedLines: PluralForms;
};

export type LogRoleMessages = {
  readonly label: string;
  readonly hint: string;
};

export type LogFileBadgeMessages = {
  readonly json: string;
  readonly csv: string;
  readonly text: string;
};

export type LogSetupMessages = {
  readonly title: string;
  readonly parsingStep: string;
  readonly errorStep: string;
  readonly fieldsStep: string;
  readonly close: string;
  readonly parsing: string;
  readonly formatHelp: string;
  readonly chooseAnother: string;
  readonly fileBadges: LogFileBadgeMessages;
  readonly fileMeta: string;
  readonly replace: string;
  readonly remove: string;
  readonly mapCaption: string;
  readonly colorsCaption: string;
  readonly detected: string;
  readonly chooseField: string;
  readonly sampleItems: PluralForms;
  readonly timestamp: LogRoleMessages;
  readonly type: LogRoleMessages;
  readonly message: LogRoleMessages;
  readonly resetColors: string;
  readonly resetColor: string;
  readonly changeColor: string;
  readonly cancel: string;
  readonly showLogs: string;
  readonly apply: string;
  readonly done: string;
  readonly invalidHint: string;
  readonly warningHint: string;
  readonly unchangedHint: string;
  readonly readyHint: string;
};

export type LogValidationMessages = {
  readonly timestampRequired: string;
  readonly timestampNone: string;
  readonly timestampPartial: string;
  readonly timestampOk: string;
  readonly typeRequired: string;
  readonly typeIsTimestamp: string;
  readonly typeTooMany: string;
  readonly typePartial: PluralForms;
  readonly typeOk: PluralForms;
  readonly messageRequired: string;
  readonly messageTaken: string;
  readonly messagePartial: PluralForms;
  readonly messageOk: string;
  readonly fieldEmpty: string;
};

export type LogTrackMessages = {
  readonly caption: string;
  readonly inView: string;
  readonly fieldsAndColors: string;
  readonly fieldsAndColorsTip: string;
  readonly hideType: string;
  readonly showType: string;
  readonly parsing: string;
  readonly failed: string;
  readonly details: string;
  readonly mapFields: PluralForms;
  readonly openSetup: string;
  readonly noneInWindow: string;
  readonly outsideData: string;
  readonly span: string;
  readonly jump: string;
  readonly allHidden: string;
  readonly showAll: string;
  readonly moreHere: string;
  readonly allTypes: string;
};

export type LogDetailMessages = {
  readonly title: string;
  readonly position: string;
  readonly previous: string;
  readonly next: string;
  readonly close: string;
  readonly center: string;
  readonly centerTip: string;
  readonly timestampRole: string;
  readonly typeRole: string;
  readonly messageRole: string;
  readonly jsonCaption: string;
  readonly lineCount: PluralForms;
  readonly find: string;
  readonly findTip: string;
  readonly copy: string;
  readonly copyTip: string;
  readonly copied: string;
  readonly copyBlocked: string;
  readonly searchPlaceholder: string;
  readonly matchPosition: string;
  readonly noResults: string;
  readonly previousMatch: string;
  readonly nextMatch: string;
  readonly closeSearch: string;
  readonly shortcuts: string;
};

export type LogsMessages = {
  readonly addLabel: string;
  readonly addTip: string;
  readonly dropHint: string;
  readonly toggleLabel: string;
  readonly toggleTip: string;
  readonly removeTip: string;
  readonly removed: string;
  readonly replacementFailed: string;
  readonly entryCount: PluralForms;
  readonly fieldCount: PluralForms;
  readonly parsed: string;
  readonly placed: PluralForms;
  readonly placedWithSkipped: string;
  readonly fixFields: string;
  readonly outsideData: string;
  readonly entryOutsideData: string;
  readonly noMessage: string;
  readonly setupUnavailable: string;
  readonly detailUnavailable: string;
  readonly failures: LogFailureMessages;
  readonly notes: LogNoteMessages;
  readonly setup: LogSetupMessages;
  readonly validation: LogValidationMessages;
  readonly track: LogTrackMessages;
  readonly detail: LogDetailMessages;
};

export type ColorPickerMessages = {
  readonly palette: string;
  readonly custom: string;
  readonly shade: string;
  readonly hue: string;
  readonly hex: string;
  readonly current: string;
  readonly picked: string;
  readonly apply: string;
  readonly cancel: string;
};

export type SearchFieldMessages = {
  readonly clear: string;
  readonly history: string;
  readonly forget: string;
};

export type Messages = {
  readonly application: ApplicationMessages;
  readonly browserEdition: BrowserEditionMessages;
  readonly windowControls: WindowControlsMessages;
  readonly units: UnitMessages;
  readonly calendar: CalendarMessages;
  readonly colorPicker: ColorPickerMessages;
  readonly searchField: SearchFieldMessages;
  readonly relativeTime: RelativeTimeMessages;
  readonly library: LibraryMessages;
  readonly newAnalysisCard: NewAnalysisCardMessages;
  readonly newAnalysisDialog: NewAnalysisDialogMessages;
  readonly timeframeBar: TimeframeBarMessages;
  readonly analysisTitle: AnalysisTitleMessages;
  readonly viewSettings: ViewSettingsMessages;
  readonly timeNav: TimeNavMessages;
  readonly timeframePopover: TimeframePopoverMessages;
  readonly chartLibrary: ChartLibraryMessages;
  readonly contextMenu: ContextMenuMessages;
  readonly canvas: CanvasMessages;
  readonly seriesMenu: SeriesMenuMessages;
  readonly statistics: StatisticsMessages;
  readonly workspace: WorkspaceMessages;
  readonly analysisUnavailable: AnalysisUnavailableMessages;
  readonly export: ExportMessages;
  readonly insights: InsightsMessages;
  readonly logs: LogsMessages;
};
