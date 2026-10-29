import { computed, effect, inject, Service, signal } from '@angular/core';
import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { statusOfFailure } from '../../../../core/gateway/gateway-request-error/gateway-request-error';
import { BuildStore } from '../../../build/store/build-store/build.store';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SharingRepository } from '../../data-access/sharing-repository/sharing.repository';
import { type LiveSession, type SessionPublication, withoutSessionOf, withSessionReplaced } from '../../models/live-session/live-session';
import { SHARE_FAILURES, type ShareFailure, shareFailureOf } from '../../models/share-failure/share-failure';

export const STATUS_POLLING_MILLISECONDS = MILLISECONDS_PER_MINUTE;

@Service()
export class SharingStore {
  private readonly _repository = inject(SharingRepository);
  private readonly _build = inject(BuildStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _sessionsState = signal<readonly LiveSession[]>([]);
  private readonly _busyAnalysisIdsState = signal<ReadonlySet<string>>(new Set());
  private readonly _hasSessions = computed(() => this._sessionsState().length > 0);

  public readonly isAvailable = this._build.sharesSessions;
  public readonly sessions = this._sessionsState.asReadonly();
  public readonly sessionsByAnalysis = computed<ReadonlyMap<string, LiveSession>>(
    () => new Map(this._sessionsState().map((session) => [session.analysisId, session])),
  );
  public readonly busyAnalysisIds = this._busyAnalysisIdsState.asReadonly();

  public constructor() {
    effect((onCleanup) => {
      if (!this._hasSessions()) {
        return;
      }

      const polling = setInterval(() => void this.refresh(), STATUS_POLLING_MILLISECONDS);

      onCleanup(() => clearInterval(polling));
    });
  }

  public async load(): Promise<void> {
    await this._build.load();
    await this.refresh();
  }

  public async refresh(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this._replaceSessions(await this._repository.sessions());
    } catch {
      return;
    }
  }

  public async start(analysisId: string, publication: SessionPublication): Promise<LiveSession | null> {
    this._markBusy(analysisId);

    try {
      const session = await this._repository.start(analysisId, publication);

      this._sessionsState.update((sessions) => withSessionReplaced(sessions, session));

      return session;
    } catch (error) {
      this._toasts.showFailure(this._startFailureMessage(shareFailureOf(statusOfFailure(error))));

      return null;
    } finally {
      this._markIdle(analysisId);
    }
  }

  public async publish(analysisId: string, publication: SessionPublication): Promise<LiveSession | null> {
    try {
      const session = await this._repository.publish(analysisId, publication);

      this._sessionsState.update((sessions) => withSessionReplaced(sessions, session));

      return session;
    } catch (error) {
      this._reportUnpublished(analysisId, shareFailureOf(statusOfFailure(error)));

      return null;
    }
  }

  public async end(analysisId: string): Promise<boolean> {
    this._markBusy(analysisId);

    try {
      await this._repository.end(analysisId);
      this._sessionsState.update((sessions) => withoutSessionOf(sessions, analysisId));
      this._toasts.show(this._texts().sharing.toasts.ended);

      return true;
    } catch {
      this._toasts.showFailure(this._texts().sharing.toasts.notEnded);

      return false;
    } finally {
      this._markIdle(analysisId);
    }
  }

  private _reportUnpublished(analysisId: string, failure: ShareFailure): void {
    const toasts = this._texts().sharing.toasts;

    if (failure !== SHARE_FAILURES.GONE) {
      this._toasts.showFailure(toasts.changesNotSent);

      return;
    }

    this._sessionsState.update((sessions) => withoutSessionOf(sessions, analysisId));
    this._toasts.showFailure(toasts.expired);
  }

  private _replaceSessions(sessions: readonly LiveSession[]): void {
    const ended = this._sessionsState().filter((known) => !sessions.some((session) => session.analysisId === known.analysisId));

    this._sessionsState.set(sessions);

    if (ended.length > 0) {
      this._toasts.show(this._texts().sharing.toasts.expired);
    }
  }

  private _startFailureMessage(failure: ShareFailure): string {
    const toasts = this._texts().sharing.toasts;

    const messages: Readonly<Record<ShareFailure, string>> = {
      [SHARE_FAILURES.TOO_LARGE]: toasts.tooLarge,
      [SHARE_FAILURES.BUSY]: toasts.busy,
      [SHARE_FAILURES.UNREACHABLE]: toasts.unreachable,
      [SHARE_FAILURES.GONE]: toasts.notStarted,
      [SHARE_FAILURES.INVALID_LINK]: toasts.notStarted,
      [SHARE_FAILURES.OTHER]: toasts.notStarted,
    };

    return messages[failure];
  }

  private _markBusy(analysisId: string): void {
    this._busyAnalysisIdsState.update((busy) => new Set([...busy, analysisId]));
  }

  private _markIdle(analysisId: string): void {
    this._busyAnalysisIdsState.update((busy) => new Set([...busy].filter((busyId) => busyId !== analysisId)));
  }
}
