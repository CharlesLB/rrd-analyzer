import { computed, inject, Service, signal } from '@angular/core';
import { MILLISECONDS_PER_SECOND } from '@rrd-analyzer/shared';
import { statusOfFailure } from '../../../../core/gateway/gateway-request-error/gateway-request-error';
import { LIVE_UPDATE_KINDS, type LiveUpdate, LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SharingRepository } from '../../data-access/sharing-repository/sharing.repository';
import { type FollowedLog, type FollowedSession, type LogHandover, logHandoverBetween } from '../../models/followed-session/followed-session';
import { SHARE_FAILURES, type ShareFailure, shareFailureOf } from '../../models/share-failure/share-failure';

export const RECONNECTION_DELAY_MILLISECONDS = 5 * MILLISECONDS_PER_SECOND;

type Connection = {
  stopWatching?: () => void;
  reconnection?: ReturnType<typeof setTimeout>;
  latestLog: FollowedLog | null;
  appliedLog: FollowedLog | null;
};

@Service()
export class SharedSessionStore {
  private readonly _repository = inject(SharingRepository);
  private readonly _channel = inject(LiveUpdatesChannel);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _followedState = signal<FollowedSession | null>(null);
  private readonly _isJoiningState = signal(false);
  private readonly _joinFailureState = signal<ShareFailure | null>(null);
  private readonly _endedAnalysisIdState = signal<string | null>(null);
  private readonly _connection: Connection = { latestLog: null, appliedLog: null };

  public readonly followed = this._followedState.asReadonly();
  public readonly isJoining = this._isJoiningState.asReadonly();
  public readonly joinFailure = this._joinFailureState.asReadonly();
  public readonly endedAnalysisId = this._endedAnalysisIdState.asReadonly();
  public readonly followedAnalysisId = computed(() => this._followedState()?.analysisId ?? null);

  public async join(sessionId: string, key: string): Promise<string | null> {
    const previous = this._followedState();

    if (previous !== null) {
      await this._stopFollowing(previous);
    }

    this._isJoiningState.set(true);
    this._joinFailureState.set(null);

    try {
      const followed = await this._repository.join(sessionId, key);

      this._take(followed);
      this._watch(followed);

      return followed.analysisId;
    } catch (error) {
      this._joinFailureState.set(shareFailureOf(statusOfFailure(error)));

      return null;
    } finally {
      this._isJoiningState.set(false);
    }
  }

  public logToOpenWith(analysisId: string): LogHandover | null {
    if (this.followedAnalysisId() !== analysisId) {
      return null;
    }

    const handover = logHandoverBetween(this._connection.appliedLog, this._connection.latestLog);

    this._connection.appliedLog = this._connection.latestLog;

    return handover;
  }

  public acknowledgeEnd(): void {
    this._endedAnalysisIdState.set(null);
  }

  private _take(followed: FollowedSession): void {
    this._connection.latestLog = followed.log;
    this._followedState.set(followed);
  }

  private _isStillFollowing(followed: FollowedSession): boolean {
    return this._followedState()?.sessionId === followed.sessionId;
  }

  private _watch(followed: FollowedSession): void {
    this._connection.stopWatching?.();
    this._connection.stopWatching = this._channel.watch(followed.liveUrl, (update) => void this._receive(update));
  }

  private async _receive(update: LiveUpdate): Promise<void> {
    const followed = this._followedState();

    if (followed === null) {
      return;
    }

    switch (update.kind) {
      case LIVE_UPDATE_KINDS.REVISION:
        if (update.revision > followed.revision) {
          await this._refresh(followed);
        }

        return;
      case LIVE_UPDATE_KINDS.RENEWED:
        this._followedState.set({ ...followed, expiresAtMilliseconds: update.expiresAtMilliseconds });

        return;
      case LIVE_UPDATE_KINDS.EXPIRED:
        await this._end(followed);

        return;
      case LIVE_UPDATE_KINDS.DISCONNECTED:
        this._reconnectLater(followed);
    }
  }

  private async _refresh(followed: FollowedSession): Promise<void> {
    try {
      const refreshed = await this._repository.refresh(followed.sessionId);

      if (this._isStillFollowing(followed)) {
        this._take(refreshed);
      }
    } catch (error) {
      if (shareFailureOf(statusOfFailure(error)) === SHARE_FAILURES.GONE) {
        await this._end(followed);
      }
    }
  }

  private _reconnectLater(followed: FollowedSession): void {
    clearTimeout(this._connection.reconnection);
    this._connection.reconnection = setTimeout(() => void this._reconnect(followed), RECONNECTION_DELAY_MILLISECONDS);
  }

  private async _reconnect(followed: FollowedSession): Promise<void> {
    await this._refresh(followed);

    if (this._isStillFollowing(followed)) {
      this._watch(followed);
    }
  }

  private async _end(followed: FollowedSession): Promise<void> {
    if (!this._isStillFollowing(followed)) {
      return;
    }

    await this._stopFollowing(followed);
    this._endedAnalysisIdState.set(followed.analysisId);
    this._toasts.showFailure(this._texts().sharing.viewer.ended);
  }

  private async _stopFollowing(followed: FollowedSession): Promise<void> {
    this._connection.stopWatching?.();
    this._connection.stopWatching = undefined;
    clearTimeout(this._connection.reconnection);
    this._followedState.set(null);
    this._connection.latestLog = null;
    this._connection.appliedLog = null;

    try {
      await this._repository.forget(followed.sessionId);
    } catch {
      return;
    }
  }
}
