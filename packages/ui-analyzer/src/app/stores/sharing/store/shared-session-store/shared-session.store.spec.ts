import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JoinedSessionDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, FIXTURE_SESSION_ID, joinedSessionDtoFixture, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { failingWith } from '../../../../core/gateway/gateway-request-error/gateway-request-error.fixture';
import { LIVE_UPDATE_KINDS, type LiveUpdate, LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { deferredPromise } from '../../../../shared/utils/deferred-promise/deferred-promise.fixture';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { LOG_HANDOVERS } from '../../models/followed-session/followed-session';
import { SHARE_FAILURES } from '../../models/share-failure/share-failure';
import { RECONNECTION_DELAY_MILLISECONDS, SharedSessionStore } from './shared-session.store';

type Watch = {
  readonly url: string;
  readonly deliver: (update: LiveUpdate) => void;
  readonly stop: ReturnType<typeof vi.fn>;
};

const KEY = 'a2V5';
const LOG = { fileId: 'f1', name: 'service.ndjson', content: '{"level":"info"}', view: { mapping: null, chosenColors: [], hiddenTypes: [], isShown: true } };

const followingOver = (overrides: Partial<AnalyzerGateway> = {}) => {
  const watches: Watch[] = [];

  const channel = {
    watch: vi.fn((url: string, listener: (update: LiveUpdate) => void) => {
      const stop = vi.fn();

      watches.push({ url, deliver: listener, stop });

      return stop;
    }),
  };

  const gateway = analyzerGatewayStub(overrides);

  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway), { provide: LiveUpdatesChannel, useValue: channel }] });

  return { store: TestBed.inject(SharedSessionStore), gateway, watches, toasts: TestBed.inject(ToastStore) };
};

const latestWatchOf = (watches: readonly Watch[]): Watch => {
  const watch = watches.at(-1);

  if (watch === undefined) {
    throw new Error('the store watches no session');
  }

  return watch;
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('SharedSessionStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('join opens the session in this tab, follows it, watches it live, and answers with the analysis it became', async () => {
    const { store, gateway, watches } = followingOver();

    const joining = store.join(FIXTURE_SESSION_ID, KEY);
    const isJoiningMeanwhile = store.isJoining();
    const analysisId = await joining;

    expect(isJoiningMeanwhile).toBe(true);
    expect(store.isJoining()).toBe(false);
    expect(analysisId).toBe('a1');
    expect(gateway.joinSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID, KEY);
    expect(store.followedAnalysisId()).toBe('a1');
    expect(store.followed()?.revision).toBe(1);
    expect(latestWatchOf(watches).url).toBe(joinedSessionDtoFixture().liveUrl);
    expect(store.joinFailure()).toBeNull();
  });

  it.each([
    { status: 404, failure: SHARE_FAILURES.GONE },
    { status: 422, failure: SHARE_FAILURES.INVALID_LINK },
    { status: 502, failure: SHARE_FAILURES.UNREACHABLE },
  ])('join, refused with $status, follows nothing and says why as $failure', async ({ status, failure }) => {
    const { store, watches } = followingOver({ joinSession: vi.fn().mockRejectedValue(failingWith(status)) });

    const analysisId = await store.join(FIXTURE_SESSION_ID, KEY);

    expect(analysisId).toBeNull();
    expect(store.followed()).toBeNull();
    expect(store.joinFailure()).toBe(failure);
    expect(watches).toEqual([]);
  });

  it('join, while following another session, lets go of that one quietly before opening the new one', async () => {
    const { store, gateway, watches, toasts } = followingOver();
    await store.join('first-session', KEY);
    const firstWatch = latestWatchOf(watches);
    vi.mocked(gateway.joinSession).mockResolvedValueOnce(joinedSessionDtoFixture({ sessionId: 'second-session', analysisId: 'a2' }));

    await store.join('second-session', KEY);

    expect(firstWatch.stop).toHaveBeenCalledTimes(1);
    expect(gateway.forgetSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID);
    expect(store.followedAnalysisId()).toBe('a2');
    expect(store.endedAnalysisId()).toBeNull();
    expect(toasts.message()).toBeNull();
  });

  it('logToOpenWith hands the log of the followed analysis over once, and nothing for another analysis', async () => {
    const { store } = followingOver({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: LOG })) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    const forAnother = store.logToOpenWith('a2');
    const handover = store.logToOpenWith('a1');
    const again = store.logToOpenWith('a1');

    expect(forAnother).toBeNull();
    expect(handover?.kind).toBe(LOG_HANDOVERS.OPENED);
    expect(again).toBeNull();
  });

  it('a newer revision is read and taken, with the log changes it brings handed over', async () => {
    const { store, gateway, watches } = followingOver();
    await store.join(FIXTURE_SESSION_ID, KEY);
    vi.mocked(gateway.refreshSession).mockResolvedValueOnce(joinedSessionDtoFixture({ revision: 3, log: LOG }));

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 3, expiresAtMilliseconds: 1 });
    await settle();

    expect(gateway.refreshSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID);
    expect(store.followed()?.revision).toBe(3);
    expect(store.logToOpenWith('a1')?.kind).toBe(LOG_HANDOVERS.OPENED);
  });

  it('a revision already taken is not read again', async () => {
    const { store, gateway, watches } = followingOver();
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 1, expiresAtMilliseconds: 1 });
    await settle();

    expect(gateway.refreshSession).not.toHaveBeenCalled();
  });

  it('a renewal moves the end of the session later without reading it again', async () => {
    const { store, gateway, watches } = followingOver();
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.RENEWED, expiresAtMilliseconds: 99 });

    expect(store.followed()?.expiresAtMilliseconds).toBe(99);
    expect(gateway.refreshSession).not.toHaveBeenCalled();
  });

  it('the end of the session erases it from this tab, stops watching, and says the analysis ended until that is acknowledged', async () => {
    const { store, gateway, watches, toasts } = followingOver();
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();

    expect(watch.stop).toHaveBeenCalledTimes(1);
    expect(gateway.forgetSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID);
    expect(store.followed()).toBeNull();
    expect(store.endedAnalysisId()).toBe('a1');
    expect(toasts.message()).toBe('the live session ended: its charts and files were erased from this tab');

    store.acknowledgeEnd();

    expect(store.endedAnalysisId()).toBeNull();
  });

  it('the end of the session, even when this tab cannot erase it, still stops following it', async () => {
    const { store, watches } = followingOver({ forgetSession: vi.fn().mockRejectedValue(new Error('gone already')) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();

    expect(store.followed()).toBeNull();
    expect(store.endedAnalysisId()).toBe('a1');
  });

  it('a revision that turns out to belong to an ended session ends it', async () => {
    const { store, watches } = followingOver({ refreshSession: vi.fn().mockRejectedValue(failingWith(404)) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    await settle();

    expect(store.endedAnalysisId()).toBe('a1');
  });

  it('a revision that cannot be read for another reason keeps following the session', async () => {
    const { store, watches } = followingOver({ refreshSession: vi.fn().mockRejectedValue(failingWith(502)) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    await settle();

    expect(store.followed()?.revision).toBe(1);
    expect(store.endedAnalysisId()).toBeNull();
  });

  it('a revision read while the session ended is dropped, and the session is ended only once', async () => {
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockReturnValue(reading.promise) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();
    reading.fail(failingWith(404));
    await settle();

    expect(store.followed()).toBeNull();
    expect(gateway.forgetSession).toHaveBeenCalledTimes(1);
  });

  it('a revision that arrives after the session ended is not taken', async () => {
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, watches } = followingOver({ refreshSession: vi.fn().mockReturnValue(reading.promise) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();
    reading.settle(joinedSessionDtoFixture({ revision: 2 }));
    await settle();

    expect(store.followed()).toBeNull();
  });

  it('an update still in flight when the watch stopped is ignored', async () => {
    const { store, gateway, watches } = followingOver();
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);
    watch.deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 5, expiresAtMilliseconds: 1 });
    await settle();

    expect(gateway.refreshSession).not.toHaveBeenCalled();
  });

  it('a dropped connection is retried a few seconds later, after reading any revision missed meanwhile', async () => {
    vi.useFakeTimers();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 4 })) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.DISCONNECTED });
    await vi.advanceTimersByTimeAsync(RECONNECTION_DELAY_MILLISECONDS);

    expect(gateway.refreshSession).toHaveBeenCalledTimes(1);
    expect(store.followed()?.revision).toBe(4);
    expect(watches).toHaveLength(2);
  });

  it('a dropped connection to a session that ended meanwhile is not retried', async () => {
    vi.useFakeTimers();
    const { store, watches } = followingOver({ refreshSession: vi.fn().mockRejectedValue(failingWith(404)) });
    await store.join(FIXTURE_SESSION_ID, KEY);

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.DISCONNECTED });
    await vi.advanceTimersByTimeAsync(RECONNECTION_DELAY_MILLISECONDS);

    expect(store.endedAnalysisId()).toBe('a1');
    expect(watches).toHaveLength(1);
  });

  it('a revision announced while a refresh runs waits for it, and the newest of several is read once after it', async () => {
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockReturnValueOnce(reading.promise) });
    vi.mocked(gateway.refreshSession).mockResolvedValue(joinedSessionDtoFixture({ revision: 4 }));
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 4, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 3, expiresAtMilliseconds: 1 });
    await settle();
    const readsMeanwhile = vi.mocked(gateway.refreshSession).mock.calls.length;
    reading.settle(joinedSessionDtoFixture({ revision: 2 }));
    await settle();

    expect(readsMeanwhile).toBe(1);
    expect(gateway.refreshSession).toHaveBeenCalledTimes(2);
    expect(store.followed()?.revision).toBe(4);
  });

  it('a revision announced while a refresh runs is not read again when that refresh already brought it', async () => {
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockReturnValue(reading.promise) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 3, expiresAtMilliseconds: 1 });
    reading.settle(joinedSessionDtoFixture({ revision: 3 }));
    await settle();

    expect(gateway.refreshSession).toHaveBeenCalledTimes(1);
    expect(store.followed()?.revision).toBe(3);
  });

  it('a revision announced while a refresh runs is dropped when the session ends before that refresh is done', async () => {
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockReturnValue(reading.promise) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 3, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
    await settle();
    reading.settle(joinedSessionDtoFixture({ revision: 2 }));
    await settle();

    expect(gateway.refreshSession).toHaveBeenCalledTimes(1);
    expect(store.followed()).toBeNull();
  });

  it('a connection dropped while a refresh runs is watched again without a second refresh', async () => {
    vi.useFakeTimers();
    const reading = deferredPromise<JoinedSessionDto>();
    const { store, gateway, watches } = followingOver({ refreshSession: vi.fn().mockReturnValue(reading.promise) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const watch = latestWatchOf(watches);

    watch.deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    watch.deliver({ kind: LIVE_UPDATE_KINDS.DISCONNECTED });
    await vi.advanceTimersByTimeAsync(RECONNECTION_DELAY_MILLISECONDS);

    expect(gateway.refreshSession).toHaveBeenCalledTimes(1);
    expect(watches).toHaveLength(2);

    reading.settle(joinedSessionDtoFixture({ revision: 2 }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.followed()?.revision).toBe(2);
  });

  it('the log of the followed session, kept by a refresh that leaves its content out, is not handed over again', async () => {
    const { store, gateway, watches } = followingOver({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: LOG })) });
    await store.join(FIXTURE_SESSION_ID, KEY);
    const opened = store.logToOpenWith('a1');
    vi.mocked(gateway.refreshSession).mockResolvedValueOnce(
      joinedSessionDtoFixture({ revision: 2, log: { fileId: LOG.fileId, name: LOG.name, view: LOG.view } }),
    );

    latestWatchOf(watches).deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 1 });
    await settle();

    expect(opened?.kind).toBe(LOG_HANDOVERS.OPENED);
    expect(store.followed()?.revision).toBe(2);
    expect(store.logToOpenWith('a1')).toBeNull();
  });
});
