import { computed, DestroyRef, effect, inject, Service, signal, untracked } from '@angular/core';
import type { ValueOf } from '../../../../shared/types/value-of';
import { copyText } from '../../../../shared/utils/clipboard-text/clipboard-text.util';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import type { OpenLog } from '../../../logs/models/log-view/log-view';
import { LogsStore } from '../../../logs/store/logs-store/logs.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import type { Canvas } from '../../../workspace/models/plotted-chart/plotted-chart';
import type { Series } from '../../../workspace/models/series/series.model';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import type { LiveSession, SessionPublication } from '../../models/live-session/live-session';
import { SharedSessionStore } from '../shared-session-store/shared-session.store';
import { SharingStore } from '../sharing-store/sharing.store';

export const PUBLICATION_DELAY_MILLISECONDS = 1500;

const SHARE_LAYERS = {
  WARNING: 'warning',
  PANEL: 'panel',
} as const;

type ShareLayer = ValueOf<typeof SHARE_LAYERS>;

type PublishedInputs = {
  readonly analysisId: string;
  readonly analysisName: string;
  readonly canvas: Canvas;
  readonly series: readonly Series[];
  readonly log: OpenLog | null;
};

type PublishedLog = {
  readonly sessionId: string;
  readonly file: File | null;
};

type Publishing = {
  timer?: ReturnType<typeof setTimeout>;
  isRunning: boolean;
  baseline: PublishedInputs | null;
  pending: PublishedInputs | null;
  publishedLog: PublishedLog | null;
};

const NO_ANALYSIS = '';

const isSameView = (first: PublishedInputs, second: PublishedInputs): boolean =>
  first.analysisName === second.analysisName && first.canvas === second.canvas && first.series === second.series && first.log === second.log;

@Service({ autoProvided: false })
export class LiveSessionStore {
  private readonly _sharing = inject(SharingStore);
  private readonly _sharedSession = inject(SharedSessionStore);
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _logs = inject(LogsStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _layerState = signal<ShareLayer | null>(null);
  private readonly _publishing: Publishing = { isRunning: false, baseline: null, pending: null, publishedLog: null };

  private readonly _inputs = computed<PublishedInputs>(() => ({
    analysisId: this._workspace.analysisId(),
    analysisName: this._workspace.analysisName(),
    canvas: this._workspace.canvas(),
    series: this._workspace.series(),
    log: this._logs.openLog(),
  }));

  public readonly session = computed<LiveSession | null>(() => this._sharing.sessionsByAnalysis().get(this._workspace.analysisId()) ?? null);
  public readonly canShare = computed(
    () =>
      this._sharing.isAvailable() && this._workspace.analysisId() !== NO_ANALYSIS && this._sharedSession.followedAnalysisId() !== this._workspace.analysisId(),
  );
  public readonly isBusy = computed(() => this._sharing.busyAnalysisIds().has(this._workspace.analysisId()));
  public readonly isWarningOpen = computed(() => this._layerState() === SHARE_LAYERS.WARNING);
  public readonly isPanelOpen = computed(() => this._layerState() === SHARE_LAYERS.PANEL && this.session() !== null);
  public readonly hasLog = computed(() => this._logs.openLog() !== null);

  public constructor() {
    effect(() => {
      const inputs = this._inputs();
      const isLive = this.session() !== null;

      untracked(() => this._notice(inputs, isLive));
    });

    inject(DestroyRef).onDestroy(() => void this._publishPending());
  }

  public requestShare(): void {
    this._layerState.set(this.session() === null ? SHARE_LAYERS.WARNING : SHARE_LAYERS.PANEL);
  }

  public closeLayer(): void {
    this._layerState.set(null);
  }

  public async confirm(): Promise<boolean> {
    const analysisId = this._workspace.analysisId();

    await this._workspace.settled();

    const inputs = this._inputs();
    const session = await this._sharing.start(analysisId, this._publicationOf(inputs, null));

    if (session === null) {
      return false;
    }

    this._publishing.baseline = inputs;
    this._publishing.publishedLog = { sessionId: session.sessionId, file: inputs.log?.file ?? null };
    this._layerState.set(SHARE_LAYERS.PANEL);

    const toasts = this._texts().sharing.toasts;

    this._toasts.show((await copyText(session.link)) ? toasts.started : toasts.startedNotCopied);

    return true;
  }

  public async end(): Promise<boolean> {
    const isEnded = await this._sharing.end(this._workspace.analysisId());

    if (isEnded) {
      this._layerState.set(null);
    }

    return isEnded;
  }

  public async copyLink(): Promise<boolean> {
    const session = this.session();

    if (session === null) {
      return false;
    }

    const isCopied = await copyText(session.link);
    const toasts = this._texts().sharing.toasts;

    this._toasts.show(isCopied ? toasts.copied : toasts.notCopied);

    return isCopied;
  }

  private _notice(inputs: PublishedInputs, isLive: boolean): void {
    const { baseline } = this._publishing;

    if (baseline !== null && baseline.analysisId !== inputs.analysisId) {
      void this._publishPending();
    }

    if (!isLive) {
      this._publishing.baseline = null;

      return;
    }

    if (baseline === null || baseline.analysisId !== inputs.analysisId) {
      this._publishing.baseline = inputs;

      return;
    }

    if (isSameView(baseline, inputs)) {
      return;
    }

    this._publishing.baseline = inputs;
    this._publishing.pending = inputs;
    clearTimeout(this._publishing.timer);
    this._publishing.timer = setTimeout(() => void this._publishPending(), PUBLICATION_DELAY_MILLISECONDS);
  }

  private async _publishPending(): Promise<void> {
    clearTimeout(this._publishing.timer);

    const { pending } = this._publishing;

    if (pending === null || this._publishing.isRunning) {
      return;
    }

    this._publishing.pending = null;
    this._publishing.isRunning = true;

    try {
      await this._publish(pending);
    } finally {
      this._publishing.isRunning = false;
    }

    await this._publishPending();
  }

  private async _publish(inputs: PublishedInputs): Promise<void> {
    await this._workspace.settled();

    const session = this._sharing.sessionsByAnalysis().get(inputs.analysisId);

    if (session === undefined) {
      return;
    }

    const published = await this._sharing.publish(inputs.analysisId, this._publicationOf(inputs, session.sessionId));

    if (published !== null) {
      this._publishing.publishedLog = { sessionId: published.sessionId, file: inputs.log?.file ?? null };
    }
  }

  private _publicationOf(inputs: PublishedInputs, sessionId: string | null): SessionPublication {
    const { log } = inputs;

    if (log === null) {
      return { log: null };
    }

    const { publishedLog } = this._publishing;
    const isPublished = publishedLog !== null && publishedLog.sessionId === sessionId && publishedLog.file === log.file;

    return { log: { ...log, sendsContent: !isPublished } };
  }
}
