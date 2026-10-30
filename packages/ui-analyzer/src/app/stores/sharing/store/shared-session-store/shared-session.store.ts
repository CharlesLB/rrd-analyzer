import { computed, inject, Service, signal } from '@angular/core';
import { MILLISECONDS_PER_SECOND } from '@rrd-analyzer/shared';
import { LIVE_UPDATE_KINDS, type LiveUpdate, LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SharingRepository } from '../../data-access/sharing-repository/sharing.repository';
import { type FollowedLog, type FollowedSession, type LogHandover, logHandoverBetween } from '../../models/followed-session/followed-session';
import { SHARE_FAILURES, type ShareFailure, shareFailureIn } from '../../models/share-failure/share-failure';

export const RECONNECTION_DELAY_MILLISECONDS = 5 * MILLISECONDS_PER_SECOND;

type Refreshing = {
  isRunning: boolean;
  announcedRevision: number | null;
};

type Connection = {
  stopWatching?: () => void;
  reconnection?: ReturnType<typeof setTimeout>;
  appliedLog: FollowedLog | null;
  refreshing: Refreshing;
};

const idleRefreshing = (): Refreshing => ({ isRunning: false, announcedRevision: null });

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
  private readonly _connection: Connection = { appliedLog: null, refreshing: idleRefreshing() };

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

      this._followedState.set(followed);
      this._watch(followed);

      return followed.analysisId;
    } catch (error) {
      this._joinFailureState.set(shareFailureIn(error));

      return null;
    } finally {
      this._isJoiningState.set(false);
    }
  }

  public logToOpenWith(analysisId: string): LogHandover | null {
    const followed = this._followedState();

    if (followed?.analysisId !== analysisId) {
      return null;
    }

    const handover = logHandoverBetween(this._connection.appliedLog, followed.log);

    this._connection.appliedLog = followed.log;

    return handover;
  }

  public acknowledgeEnd(): void {
    this._endedAnalysisIdState.set(null);
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
        await this._refreshFor(followed, update.revision);

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

  private async _refreshFor(followed: FollowedSession, revision: number): Promise<void> {
    const { refreshing } = this._connection;

    if (revision <= followed.revision) {
      return;
    }

    if (refreshing.isRunning) {
      refreshing.announcedRevision = Math.max(revision, refreshing.announcedRevision ?? revision);

      return;
    }

    await this._refresh(followed);
  }

  private async _refresh(followed: FollowedSession): Promise<void> {
    const { refreshing } = this._connection;

    if (refreshing.isRunning) {
      return;
    }

    refreshing.isRunning = true;
    await this._readLatest(followed);
    refreshing.isRunning = false;

    const { announcedRevision } = refreshing;
    const current = this._followedState();

    refreshing.announcedRevision = null;

    if (announcedRevision !== null && current?.sessionId === followed.sessionId) {
      await this._refreshFor(current, announcedRevision);
    }
  }

  private async _readLatest(followed: FollowedSession): Promise<void> {
    try {
      const refreshed = await this._repository.refresh(followed.sessionId);

      if (this._isStillFollowing(followed)) {
        this._followedState.set(refreshed);
      }
    } catch (error) {
      if (shareFailureIn(error) === SHARE_FAILURES.GONE) {
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
    this._connection.appliedLog = null;
    this._connection.refreshing = idleRefreshing();

    try {
      await this._repository.forget(followed.sessionId);
    } catch {
      return;
    }
  }
}
