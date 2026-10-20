import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import * as R from 'remeda';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { type SeriesTraits, seriesTraitsOf } from '../../../workspace/models/chart-axes/chart-axes';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { InsightsRepository } from '../../data-access/insights-repository/insights.repository';
import type { AnalyzedRun } from '../../models/analyzed-run/analyzed-run';
import { type EvidenceJump, type Finding, INSIGHT_SCOPES, type InsightScope, type InsightsReport } from '../../models/finding/finding.model';
import { clampedFocusOf, movedFocusOf } from '../../models/finding-focus/finding-focus';
import { evidenceFrameOf, findingFrameOf } from '../../models/finding-frame/finding-frame';
import {
  FLASH_MILLISECONDS,
  INSIGHT_STATUSES,
  type InsightStatus,
  RUN_REVEAL_DELAY_MILLISECONDS,
  RUN_TICK_MILLISECONDS,
  runKeyOf,
  runProgressAt,
  STALE_REASONS,
  type StaleReason,
  stageIndexAt,
} from '../../models/insights-run/insights-run';

const COMPLETE_PROGRESS = 1;
const NEXT_FINDING = 1;
const PREVIOUS_FINDING = -1;

type CompletedRun = {
  readonly key: string;
  readonly analysisId: string;
  readonly finishedAtMilliseconds: number;
  readonly report: InsightsReport;
};

type PendingRun = Pick<CompletedRun, 'key' | 'analysisId'>;

type StartedRun = PendingRun & { readonly statusBefore: InsightStatus };

type RunTimers = {
  progress?: ReturnType<typeof setInterval>;
  reveal?: ReturnType<typeof setTimeout>;
  flash?: ReturnType<typeof setTimeout>;
};

type RunInFlight = {
  current?: {
    readonly cancellation: AbortController;
    readonly statusBefore: InsightStatus;
    readonly analysisId: string;
  };
};

const firstFindingExpanded = (report: InsightsReport): Readonly<Record<string, boolean>> => {
  const [first] = report.findings;

  return first === undefined ? {} : { [first.id]: true };
};

@Service({ autoProvided: false })
export class InsightsStore {
  private readonly _repository = inject(InsightsRepository);
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _seriesData = inject(SeriesDataStore);
  private readonly _timeWindow = inject(TimeWindowStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _timers: RunTimers = {};
  private readonly _inFlight: RunInFlight = {};

  private readonly _statusState = signal<InsightStatus>(INSIGHT_STATUSES.IDLE);
  private readonly _progressState = signal(0);
  private readonly _completedRunState = signal<CompletedRun | null>(null);
  private readonly _currentConfigurationState = signal<string | null>(null);
  private readonly _scopeState = signal<InsightScope>(INSIGHT_SCOPES.ALL);
  private readonly _isPanelRequestedState = signal(false);
  private readonly _focusIndexState = signal(0);
  private readonly _expandedState = signal<Readonly<Record<string, boolean>>>({});
  private readonly _hoveredFindingIdState = signal<string | null>(null);
  private readonly _flashingFindingIdState = signal<string | null>(null);
  private readonly _areOverlaysHiddenState = signal(false);

  public readonly status = this._statusState.asReadonly();
  public readonly progress = this._progressState.asReadonly();
  public readonly scope = this._scopeState.asReadonly();
  public readonly focusIndex = this._focusIndexState.asReadonly();
  public readonly expanded = this._expandedState.asReadonly();
  public readonly areOverlaysHidden = this._areOverlaysHiddenState.asReadonly();
  public readonly hoveredFindingId = this._hoveredFindingIdState.asReadonly();
  public readonly flashingFindingId = this._flashingFindingIdState.asReadonly();
  public readonly stageIndex = computed(() => stageIndexAt(this._progressState()));
  private readonly _latestReport = computed(() => this._completedRunState()?.report ?? null);
  private readonly _isReportOfThisAnalysis = computed(() => this._completedRunState()?.analysisId === this._workspace.analysisId());

  public readonly latestReportFindings = computed(() => this._latestReport()?.findings ?? []);
  public readonly findings = computed(() => (this._isReportOfThisAnalysis() ? this.latestReportFindings() : []));
  public readonly isDone = computed(() => this._statusState() === INSIGHT_STATUSES.DONE);
  public readonly isPanelOpen = computed(() => this._isPanelRequestedState() && this.isDone() && this._isReportOfThisAnalysis());
  private readonly _currentKey = computed(() => runKeyOf(this._workspace.analysisId(), this._scopeState(), this._timeWindow.window()));

  public readonly staleReason = computed<StaleReason | null>(() => {
    const completed = this._completedRunState();

    if (!this.isDone() || completed === null) {
      return null;
    }

    if (completed.report.configurationStamp !== (this._currentConfigurationState() ?? completed.report.configurationStamp)) {
      return STALE_REASONS.CONFIGURATION;
    }

    return completed.key === this._currentKey() ? null : STALE_REASONS.VIEW;
  });

  public readonly isStale = computed(() => this.staleReason() !== null);

  public readonly analyzedRun = computed<AnalyzedRun | null>(() => {
    const completed = this._completedRunState();

    return completed === null
      ? null
      : {
          ranAtMilliseconds: completed.finishedAtMilliseconds,
          scope: completed.report.scope,
          window: { fromMilliseconds: completed.report.fromMilliseconds, untilMilliseconds: completed.report.untilMilliseconds },
          unclassifiedLabels: completed.report.unclassifiedLabels,
        };
  });

  private readonly _focusedFinding = computed(() => {
    const findings = this.findings();

    return findings[clampedFocusOf(this._focusIndexState(), findings.length)] ?? null;
  });

  public readonly isFocusedExpanded = computed(() => {
    const focused = this._focusedFinding();

    return focused !== null && this._expandedState()[focused.id] === true;
  });

  public readonly overlaidFindings = computed(() => (this.isDone() && !this._areOverlaysHiddenState() ? this.findings() : []));

  public constructor() {
    inject(DestroyRef).onDestroy(() => this.cancel());

    effect(() => {
      const analysisId = this._workspace.analysisId();

      untracked(() => this._cancelRunOfAnotherAnalysis(analysisId));
    });
  }

  public async run(): Promise<void> {
    await this._startRun(this._statusState());
  }

  public async rerun(): Promise<void> {
    if (this._inFlight.current !== undefined) {
      return;
    }

    const statusBefore = this._statusState();

    this._statusState.set(INSIGHT_STATUSES.IDLE);
    await this._startRun(statusBefore);
  }

  public async checkConfiguration(): Promise<void> {
    if (!this.isDone()) {
      return;
    }

    try {
      this._currentConfigurationState.set(await this._repository.configurationStamp());
    } catch {
      return;
    }
  }

  public cancel(): void {
    const current = this._inFlight.current;

    if (current === undefined) {
      return;
    }

    current.cancellation.abort();
    this._endRun();
    this._statusState.set(current.statusBefore);
  }

  public async togglePanel(): Promise<void> {
    if (this.isDone() && !this._isReportOfThisAnalysis()) {
      await this.run();

      return;
    }

    this._requestPanel(!this._isPanelRequestedState());
  }

  public closePanel(): void {
    this._requestPanel(false);
  }

  public toggleOverlays(): void {
    this._areOverlaysHiddenState.update((isHidden) => !isHidden);
  }

  public toggleShown(): void {
    if (!this._areOverlaysHiddenState()) {
      this._requestPanel(false);
    }

    this.toggleOverlays();
  }

  public chooseScope(scope: InsightScope): void {
    this._scopeState.set(scope);
  }

  public toggleFinding(index: number): void {
    const finding = this.findings()[index];

    if (finding === undefined) {
      return;
    }

    this._focusIndexState.set(index);
    this._setExpanded(finding, this._expandedState()[finding.id] !== true);
  }

  public hoverFinding(findingId: string | null): void {
    this._hoveredFindingIdState.set(findingId);
  }

  public focusNext(): void {
    this._moveFocus(NEXT_FINDING);
  }

  public focusPrevious(): void {
    this._moveFocus(PREVIOUS_FINDING);
  }

  public toggleFocused(): void {
    const focused = this._focusedFinding();

    if (focused !== null) {
      this._setExpanded(focused, !this.isFocusedExpanded());
    }
  }

  public collapseFocused(): void {
    const focused = this._focusedFinding();

    if (focused !== null) {
      this._setExpanded(focused, false);
    }
  }

  public showOnChart(finding: Finding): void {
    this._workspace.plotMerged(
      R.map(finding.evidence, (evidence) => evidence.seriesId),
      (seriesId) => this._traitsOf(seriesId),
    );
    this._timeWindow.setWindow(findingFrameOf(finding));
    this._areOverlaysHiddenState.set(false);
    this._flash(finding.id);
  }

  public showFocusedOnChart(): void {
    const focused = this._focusedFinding();

    if (focused !== null) {
      this.showOnChart(focused);
    }
  }

  public jumpToEvidence(jump: EvidenceJump): void {
    this._timeWindow.setWindow(evidenceFrameOf(jump.evidence, this._timeWindow.step()));
    this._areOverlaysHiddenState.set(false);
    this._flash(jump.finding.id);
  }

  private _traitsOf(seriesId: string): SeriesTraits {
    return seriesTraitsOf(this._workspace.seriesById().get(seriesId), this._seriesData.statisticsOf(seriesId));
  }

  private _cancelRunOfAnotherAnalysis(analysisId: string): void {
    const current = this._inFlight.current;

    if (current !== undefined && current.analysisId !== analysisId) {
      this.cancel();
    }
  }

  private async _startRun(statusBefore: InsightStatus): Promise<void> {
    if (this._inFlight.current !== undefined) {
      return;
    }

    const run = { key: this._currentKey(), analysisId: this._workspace.analysisId(), statusBefore };

    await this._runEngine(run, this._scopeState(), this._timeWindow.window());
  }

  private async _runEngine(run: StartedRun, scope: InsightScope, visibleWindow: TimeRange): Promise<void> {
    const cancellation = new AbortController();

    this._inFlight.current = { cancellation, statusBefore: run.statusBefore, analysisId: run.analysisId };
    this._timers.reveal = setTimeout(() => this._revealRun(), RUN_REVEAL_DELAY_MILLISECONDS);

    try {
      const report = await this._repository.run({ analysisId: run.analysisId, scope, window: visibleWindow }, cancellation.signal);

      if (cancellation.signal.aborted) {
        return;
      }

      this._endRun();
      this._progressState.set(COMPLETE_PROGRESS);
      this._finish(report, run);
    } catch {
      if (cancellation.signal.aborted) {
        return;
      }

      this._endRun();
      this._statusState.set(run.statusBefore);
      this._toasts.showFailure(this._texts().insights.runFailed);
    }
  }

  private _revealRun(): void {
    const startedAtMilliseconds = Date.now();

    this._statusState.set(INSIGHT_STATUSES.RUNNING);
    this._progressState.set(0);
    this._timers.progress = setInterval(() => {
      this._progressState.set(runProgressAt(Date.now() - startedAtMilliseconds));
    }, RUN_TICK_MILLISECONDS);
  }

  private _endRun(): void {
    this._inFlight.current = undefined;
    clearTimeout(this._timers.reveal);
    clearInterval(this._timers.progress);
  }

  private _finish(report: InsightsReport, run: PendingRun): void {
    this._completedRunState.set({ key: run.key, analysisId: run.analysisId, finishedAtMilliseconds: Date.now(), report });
    this._currentConfigurationState.set(report.configurationStamp);
    this._expandedState.set(firstFindingExpanded(report));
    this._statusState.set(INSIGHT_STATUSES.DONE);
    this._requestPanel(true);
    this._areOverlaysHiddenState.set(false);
    this._focusIndexState.set(0);
  }

  private _requestPanel(isRequested: boolean): void {
    this._isPanelRequestedState.set(isRequested);
    this._hoveredFindingIdState.set(null);
  }

  private _moveFocus(offset: number): void {
    this._focusIndexState.set(movedFocusOf(this._focusIndexState(), this.findings().length, offset));
  }

  private _setExpanded(finding: Finding, isExpanded: boolean): void {
    this._expandedState.update((expanded) => ({ ...expanded, [finding.id]: isExpanded }));
  }

  private _flash(findingId: string): void {
    this._flashingFindingIdState.set(findingId);
    clearTimeout(this._timers.flash);
    this._timers.flash = setTimeout(() => {
      this._flashingFindingIdState.set(null);
    }, FLASH_MILLISECONDS);
  }
}
