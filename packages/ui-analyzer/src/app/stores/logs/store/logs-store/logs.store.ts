import { computed, effect, inject, Service, signal, untracked } from '@angular/core';
import { formatMessage, formatPlural, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { formatFileSize } from '../../../../shared/utils/file-size/file-size.util';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { InsightsStore } from '../../../insights/store/insights-store/insights.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { spanOf, type TimeRange } from '../../../workspace/models/timeframe/timeframe';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { discoverLogFields } from '../../models/log-field/log-field';
import { logFormatOf } from '../../models/log-format/log-format';
import {
  detectMapping,
  EMPTY_MAPPING,
  isSameMapping,
  LOG_ROLES,
  type LogMapping,
  type LogRole,
  UNMAPPED,
  withRoleMapped,
} from '../../models/log-mapping/log-mapping';
import { type EntryReading, readMessageOf, readTimeOf, readTypeOf } from '../../models/log-reading/log-reading';
import { type TypeColors, typeColorsOf, UNKNOWN_LOG_TYPE } from '../../models/log-severity/log-severity';
import { type LogFailure, type LogRecord, MAXIMUM_LOG_FILE_BYTES, MAXIMUM_LOG_FILE_MEGABYTES, parseLogText } from '../../models/log-source/log-source';
import {
  LOG_PANELS,
  LOG_STATUSES,
  type LogFileSummary,
  type LogPanel,
  type LogStatus,
  STEP_DIRECTIONS,
  type StepDirection,
} from '../../models/log-state/log-state';
import {
  entriesOfTypesShown,
  type LogEntry,
  rankedTypeCountsOf,
  type ShownPosition,
  shownPositionOf,
  steppedEntryOf,
  timelineOfReadings,
} from '../../models/log-timeline/log-timeline';
import {
  mappingValidationOf,
  messageValidationOf,
  timestampValidationOf,
  typeValidationOf,
  type ValidationTexts,
} from '../../models/log-validation/log-validation';
import type { LoadedLogs, LogsSnapshot, Placement } from '../../models/logs-snapshot/logs-snapshot';
import { LogsMemoryStore } from '../logs-memory-store/logs-memory.store';

type LogSource = {
  readonly file: LogFileSummary | null;
  readonly isLoading: boolean;
  readonly failure: LogFailure | null;
  readonly loaded: LoadedLogs | null;
};

export type EntryPosition = {
  readonly position: number;
  readonly total: number;
};

const NO_SOURCE: LogSource = { file: null, isLoading: false, failure: null, loaded: null };
const NO_COLORS: TypeColors = new Map();
const NO_TYPES: ReadonlySet<string> = new Set();
const NO_RECORDS: readonly LogRecord[] = [];
const NO_DETAIL = '';
const NOT_SHOWN = -1;
const NO_ANALYSIS = '';
const JUMP_MARGIN_MILLISECONDS = 15 * MILLISECONDS_PER_MINUTE;

const isWithin = (instant: number, range: TimeRange): boolean => instant >= range.fromMilliseconds && instant <= range.untilMilliseconds;

const overlaps = (first: TimeRange, second: TimeRange): boolean =>
  first.fromMilliseconds <= second.untilMilliseconds && first.untilMilliseconds >= second.fromMilliseconds;

const readTextOf = async (file: File): Promise<string | null> => {
  try {
    return await file.text();
  } catch {
    return null;
  }
};

@Service({ autoProvided: false })
export class LogsStore {
  private readonly _timeWindow = inject(TimeWindowStore);
  private readonly _insights = inject(InsightsStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _memory = inject(LogsMemoryStore);
  private readonly _texts = inject(I18nStore).texts;
  private readonly _session = { analysisId: NO_ANALYSIS };

  private readonly _sourceState = signal<LogSource>(NO_SOURCE);
  private readonly _incomingFileState = signal<LogFileSummary | null>(null);
  private readonly _draftMappingState = signal<LogMapping>(EMPTY_MAPPING);
  private readonly _placementState = signal<Placement | null>(null);
  private readonly _chosenColorsState = signal<TypeColors>(NO_COLORS);
  private readonly _hiddenTypesState = signal<ReadonlySet<string>>(NO_TYPES);
  private readonly _isShownState = signal(false);
  private readonly _panelState = signal<LogPanel | null>(null);
  private readonly _selectedIndexState = signal<number | null>(null);
  private readonly _hoveredIndexState = signal<number | null>(null);

  private readonly _loaded = computed(() => this._sourceState().loaded);
  private readonly _timeline = computed(() => this._placementState()?.timeline ?? null);

  private readonly _snapshot = computed<LogsSnapshot | null>(() => {
    const { file, loaded } = this._sourceState();

    return file === null || loaded === null
      ? null
      : {
          file,
          loaded,
          draftMapping: this._draftMappingState(),
          placement: this._placementState(),
          chosenColors: this._chosenColorsState(),
          hiddenTypes: this._hiddenTypesState(),
          isShown: this._isShownState(),
        };
  });

  public readonly file = computed(() => this._sourceState().file);
  public readonly failure = computed(() => this._sourceState().failure);
  public readonly isReplacing = computed(() => this._incomingFileState() !== null && this._loaded() !== null);
  public readonly notes = computed(() => this._loaded()?.notes ?? []);
  public readonly fields = computed(() => this._loaded()?.fields ?? []);
  public readonly recordCount = computed(() => this._loaded()?.records.length ?? 0);
  public readonly detectedMapping = computed(() => this._loaded()?.detectedMapping ?? EMPTY_MAPPING);
  public readonly draftMapping = this._draftMappingState.asReadonly();
  public readonly appliedMapping = computed(() => this._placementState()?.mapping ?? EMPTY_MAPPING);
  public readonly chosenColors = this._chosenColorsState.asReadonly();
  public readonly hiddenTypes = this._hiddenTypesState.asReadonly();
  public readonly isShown = this._isShownState.asReadonly();
  public readonly panel = this._panelState.asReadonly();
  public readonly entries = computed(() => this._timeline()?.entries ?? []);
  public readonly types = computed(() => this._timeline()?.types ?? []);
  public readonly span = computed(() => this._timeline()?.span ?? null);

  public readonly status = computed<LogStatus>(() => {
    const source = this._sourceState();

    if (source.file === null) {
      return LOG_STATUSES.NONE;
    }

    if (source.isLoading) {
      return LOG_STATUSES.LOADING;
    }

    if (source.loaded === null) {
      return LOG_STATUSES.FAILED;
    }

    return this._placementState() === null ? LOG_STATUSES.SETUP : LOG_STATUSES.READY;
  });

  public readonly isTrackShown = computed(() => this._isShownState() && this.status() !== LOG_STATUSES.NONE);
  public readonly isSetupOpen = computed(() => this._panelState() === LOG_PANELS.SETUP);
  public readonly isDetailOpen = computed(() => this._panelState() === LOG_PANELS.DETAIL && this.selectedEntry() !== null);

  private readonly _records = computed(() => this._loaded()?.records ?? NO_RECORDS);
  private readonly _timestampPath = computed(() => this._draftMappingState()[LOG_ROLES.TIMESTAMP]);
  private readonly _typePath = computed(() => this._draftMappingState()[LOG_ROLES.TYPE]);
  private readonly _messagePath = computed(() => this._draftMappingState()[LOG_ROLES.MESSAGE]);
  private readonly _readTimes = computed(() => R.map(this._records(), (record) => readTimeOf(record, this._timestampPath())));
  private readonly _readTypes = computed(() => R.map(this._records(), (record) => readTypeOf(record, this._typePath())));
  private readonly _readMessages = computed(() => R.map(this._records(), (record) => readMessageOf(record, this._messagePath())));
  private readonly _readTypeCounts = computed(() => (this._typePath() === UNMAPPED ? [] : rankedTypeCountsOf(this._readTypes())));

  private readonly _readings = computed<readonly EntryReading[]>(() => {
    const types = this._readTypes();
    const messages = this._readMessages();

    return R.map(this._readTimes(), (timeMilliseconds, position) => ({
      timeMilliseconds,
      type: types[position] ?? UNKNOWN_LOG_TYPE,
      message: messages[position],
    }));
  });

  private readonly _validationTexts = computed<ValidationTexts>(() => {
    const texts = this._texts();

    return { logs: texts.logs, units: texts.units, listSeparator: texts.application.listSeparator };
  });

  private readonly _timestampValidation = computed(() => timestampValidationOf(this._readTimes(), this._timestampPath(), this._validationTexts()));

  private readonly _typeValidation = computed(() =>
    typeValidationOf(
      { ...EMPTY_MAPPING, [LOG_ROLES.TIMESTAMP]: this._timestampPath(), [LOG_ROLES.TYPE]: this._typePath() },
      this._readTypeCounts(),
      this._records().length,
      this._validationTexts(),
    ),
  );

  private readonly _messageValidation = computed(() => messageValidationOf(this._readMessages(), this._draftMappingState(), this._validationTexts()));

  public readonly validation = computed(() =>
    this._loaded() === null
      ? null
      : mappingValidationOf(
          {
            [LOG_ROLES.TIMESTAMP]: this._timestampValidation(),
            [LOG_ROLES.TYPE]: this._typeValidation(),
            [LOG_ROLES.MESSAGE]: this._messageValidation(),
          },
          this._readings(),
        ),
  );

  public readonly isMappingChanged = computed(() => {
    const placement = this._placementState();

    return placement === null || !isSameMapping(placement.mapping, this._draftMappingState());
  });

  public readonly typeColors = computed(() => {
    const placed = R.map(this.types(), (type) => type.name);
    const drafted = R.map(this.validation()?.types ?? [], (type) => type.name);

    return typeColorsOf(R.unique([...placed, ...drafted]), this._chosenColorsState());
  });

  public readonly selectedEntry = computed(() => this._entryAt(this._selectedIndexState()));
  public readonly hoveredEntry = computed(() => this._entryAt(this._hoveredIndexState()));

  private readonly _shownEntries = computed(() => entriesOfTypesShown(this.entries(), this._hiddenTypesState()));

  private readonly _selectedShownPosition = computed<ShownPosition | null>(() => {
    const selected = this.selectedEntry();

    return selected === null ? null : shownPositionOf(this._shownEntries(), selected.index);
  });

  public readonly selectedPosition = computed<EntryPosition | null>(() => {
    const located = this._selectedShownPosition();

    return located === null ? null : { position: located.isShown ? located.position : NOT_SHOWN, total: this._shownEntries().length };
  });

  public readonly canStepBackward = computed(() => this._steppedFromSelected(STEP_DIRECTIONS.BACKWARD) !== undefined);
  public readonly canStepForward = computed(() => this._steppedFromSelected(STEP_DIRECTIONS.FORWARD) !== undefined);

  public constructor() {
    effect(() => {
      if (this._insights.isPanelOpen()) {
        untracked(() => this._closePanel());
      }
    });

    effect(() => {
      const analysisId = this._workspace.analysisId();
      const snapshot = this._snapshot();

      untracked(() => this._keepForTheSession(analysisId, snapshot));
    });
  }

  public async load(file: File): Promise<boolean> {
    const texts = this._texts();
    const summary: LogFileSummary = { name: file.name, sizeBytes: file.size };
    const isReplacement = this._loaded() !== null;

    this._incomingFileState.set(summary);

    if (!isReplacement) {
      this._beginLoading(summary);
    }

    if (file.size > MAXIMUM_LOG_FILE_BYTES) {
      return this._fail(summary, {
        title: formatMessage(texts.logs.failures.tooLarge, {
          size: formatFileSize(file.size, texts.units),
          limit: `${MAXIMUM_LOG_FILE_MEGABYTES} ${texts.units.megabytes}`,
        }),
        detail: NO_DETAIL,
      });
    }

    const text = await readTextOf(file);

    if (this._incomingFileState() !== summary) {
      return false;
    }

    if (text === null) {
      return this._fail(summary, { title: texts.logs.failures.unreadable, detail: formatMessage(texts.logs.failures.unreadableDetail, { file: file.name }) });
    }

    const { parsed, failure } = parseLogText(text, texts.logs, logFormatOf(file.name));

    if (parsed === null) {
      return this._fail(summary, failure);
    }

    const discovered = discoverLogFields(parsed.records);
    const detectedMapping = detectMapping(discovered);

    this._incomingFileState.set(null);
    this._sourceState.set({ file: summary, isLoading: false, failure: null, loaded: { ...parsed, fields: discovered.fields, detectedMapping } });
    this._draftMappingState.set(detectedMapping);
    this._hiddenTypesState.set(NO_TYPES);

    if (isReplacement) {
      this._placementState.set(null);
      this._isShownState.set(true);
      this.openSetup();
    }

    this._toasts.show(
      formatMessage(texts.logs.parsed, {
        entries: formatPlural(texts.logs.entryCount, parsed.records.length, { count: formatCount(parsed.records.length) }),
        fields: formatPlural(texts.logs.fieldCount, discovered.fields.length),
      }),
    );

    return true;
  }

  public remove(): boolean {
    const texts = this._texts();
    const name = this._sourceState().file?.name;
    const removed = this._snapshot();

    this.clear();

    if (name === undefined) {
      return false;
    }

    this._toasts.show(
      formatMessage(texts.logs.removed, { file: name }),
      removed === null ? null : { label: texts.workspace.undo, run: () => this._restoreUnlessLogsCameSince(removed) },
    );

    return true;
  }

  public clear(): void {
    this._incomingFileState.set(null);
    this._sourceState.set(NO_SOURCE);
    this._draftMappingState.set(EMPTY_MAPPING);
    this._placementState.set(null);
    this._chosenColorsState.set(NO_COLORS);
    this._hiddenTypesState.set(NO_TYPES);
    this._isShownState.set(false);
    this._closePanel();
  }

  public toggleShown(): void {
    if (this._isShownState()) {
      this._closePanel();
    }

    this._isShownState.update((isShown) => !isShown);
  }

  public openSetup(): void {
    this._openPanel(LOG_PANELS.SETUP);
    this._selectedIndexState.set(null);
  }

  public cancelSetup(): void {
    const placement = this._placementState();

    if (placement !== null) {
      this._draftMappingState.set(placement.mapping);
    }

    this._closePanel();
  }

  public chooseField(role: LogRole, path: string): void {
    this._draftMappingState.update((mapping) => withRoleMapped(mapping, role, path));
  }

  public confirmSetup(): boolean {
    if (!this.isMappingChanged()) {
      this._closePanel();

      return true;
    }

    return this._placeEntries();
  }

  public chooseColor(type: string, color: string): void {
    this._chosenColorsState.update((chosen) => new Map([...chosen, [type, color]]));
  }

  public resetColor(type: string): void {
    this._chosenColorsState.update((chosen) => new Map(R.filter([...chosen], ([name]) => name !== type)));
  }

  public resetColors(): void {
    this._chosenColorsState.set(NO_COLORS);
  }

  public toggleType(name: string): void {
    this._hiddenTypesState.update((hidden) => new Set(hidden.has(name) ? R.filter([...hidden], (type) => type !== name) : [...hidden, name]));
    this._hoveredIndexState.set(null);
  }

  public showAllTypes(): void {
    this._hiddenTypesState.set(NO_TYPES);
  }

  public hover(index: number | null): void {
    this._hoveredIndexState.set(index);
  }

  public select(index: number): void {
    if (this._entryAt(index) === null) {
      return;
    }

    this._selectedIndexState.set(index);
    this._openPanel(LOG_PANELS.DETAIL);
  }

  public step(direction: StepDirection): void {
    const next = this._steppedFromSelected(direction);

    if (next === undefined) {
      return;
    }

    this.select(next.index);

    if (!this._isInWindow(next)) {
      this._centerOn(next);
    }
  }

  public closeDetail(): void {
    this._closePanel();
  }

  public centerOnSelected(): boolean {
    const selected = this.selectedEntry();

    return selected !== null && this._centerOn(selected);
  }

  public jumpToLogs(): boolean {
    const span = this.span();
    const bounds = this._timeWindow.bounds();

    if (span === null) {
      return false;
    }

    if (!overlaps(span, bounds)) {
      this._toasts.show(this._texts().logs.outsideData);

      return false;
    }

    this._timeWindow.setWindow({
      fromMilliseconds: Math.max(bounds.fromMilliseconds, span.fromMilliseconds - JUMP_MARGIN_MILLISECONDS),
      untilMilliseconds: Math.min(bounds.untilMilliseconds, span.untilMilliseconds + JUMP_MARGIN_MILLISECONDS),
    });

    return true;
  }

  private _keepForTheSession(analysisId: string, snapshot: LogsSnapshot | null): void {
    if (analysisId === NO_ANALYSIS) {
      return;
    }

    const isFirstSightOfTheAnalysis = this._session.analysisId !== analysisId;

    this._session.analysisId = analysisId;

    if (isFirstSightOfTheAnalysis && snapshot === null) {
      this._showRemembered(analysisId);

      return;
    }

    if (snapshot === null) {
      this._memory.forget(analysisId);

      return;
    }

    this._memory.remember(analysisId, snapshot);
  }

  private _showRemembered(analysisId: string): void {
    const remembered = this._memory.snapshotOf(analysisId);

    if (remembered !== null && this._sourceState().file === null && this._incomingFileState() === null) {
      this._show(remembered);
    }
  }

  private _restoreUnlessLogsCameSince(removed: LogsSnapshot): boolean {
    if (this._sourceState().file !== null || this._incomingFileState() !== null) {
      return false;
    }

    this._show(removed);

    return true;
  }

  private _show(snapshot: LogsSnapshot): void {
    this._sourceState.set({ file: snapshot.file, isLoading: false, failure: null, loaded: snapshot.loaded });
    this._draftMappingState.set(snapshot.draftMapping);
    this._placementState.set(snapshot.placement);
    this._chosenColorsState.set(snapshot.chosenColors);
    this._hiddenTypesState.set(snapshot.hiddenTypes);
    this._isShownState.set(snapshot.isShown);
  }

  private _beginLoading(file: LogFileSummary): void {
    this._sourceState.set({ file, isLoading: true, failure: null, loaded: null });
    this._placementState.set(null);
    this._isShownState.set(true);
    this._hoveredIndexState.set(null);
    this.openSetup();
  }

  private _fail(file: LogFileSummary, failure: LogFailure): boolean {
    this._incomingFileState.set(null);

    if (this._loaded() === null) {
      this._sourceState.set({ file, isLoading: false, failure, loaded: null });

      return false;
    }

    this._toasts.showFailure(formatMessage(this._texts().logs.replacementFailed, { file: file.name, reason: failure.title }));

    return false;
  }

  private _placeEntries(): boolean {
    const texts = this._texts().logs;
    const loaded = this._loaded();
    const mapping = this._draftMappingState();

    if (loaded === null || this.validation()?.isValid !== true) {
      this._toasts.show(texts.fixFields);

      return false;
    }

    const timeline = timelineOfReadings(loaded.records, this._readings(), texts);
    const placed = formatPlural(texts.placed, timeline.entries.length, { count: formatCount(timeline.entries.length) });

    this._placementState.set({ mapping, timeline });
    this._hiddenTypesState.set(NO_TYPES);
    this._isShownState.set(true);
    this._closePanel();
    this._toasts.show(timeline.skippedCount === 0 ? placed : formatMessage(texts.placedWithSkipped, { placed, count: formatCount(timeline.skippedCount) }));

    return true;
  }

  private _openPanel(panel: LogPanel): void {
    this._panelState.set(panel);
    this._insights.closePanel();
  }

  private _closePanel(): void {
    this._panelState.set(null);
    this._selectedIndexState.set(null);
    this._hoveredIndexState.set(null);
  }

  private _entryAt(index: number | null): LogEntry | null {
    return index === null ? null : (this.entries()[index] ?? null);
  }

  private _steppedFromSelected(direction: StepDirection): LogEntry | undefined {
    const located = this._selectedShownPosition();

    return located === null ? undefined : steppedEntryOf(this._shownEntries(), located, direction);
  }

  private _isInWindow(entry: LogEntry): boolean {
    const window = this._timeWindow.window();

    return isWithin(entry.timeMilliseconds, window);
  }

  private _centerOn(entry: LogEntry): boolean {
    const halfSpan = spanOf(this._timeWindow.window()) / 2;
    const centered: TimeRange = { fromMilliseconds: entry.timeMilliseconds - halfSpan, untilMilliseconds: entry.timeMilliseconds + halfSpan };

    if (!isWithin(entry.timeMilliseconds, this._timeWindow.bounds())) {
      this._toasts.show(this._texts().logs.entryOutsideData);

      return false;
    }

    this._timeWindow.setWindow(centered);

    return true;
  }
}
