import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub, sessionStatusDtoFixture } from '../../../../core/gateway/analyzer.gateway.fixture';
import { GatewayRequestError } from '../../../../core/gateway/gateway-request-error/gateway-request-error';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SharingStore, STATUS_POLLING_MILLISECONDS } from './sharing.store';

const SHARING_BUILD = { version: '1.4.0', commit: 'none', date: 'unknown', summary: '1.4.0', sharesSessions: true };
const NO_LOG = { log: null };

const failingWith = (status: number): GatewayRequestError => new GatewayRequestError(`failed: ${status}`, status);

const sharingOver = async (overrides: Partial<AnalyzerGateway> = {}): Promise<{ readonly store: SharingStore; readonly gateway: AnalyzerGateway }> => {
  const gateway = analyzerGatewayStub({ fetchBuild: vi.fn().mockResolvedValue(SHARING_BUILD), ...overrides });

  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

  const store = TestBed.inject(SharingStore);

  await store.load();

  return { store, gateway };
};

describe('SharingStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('load, in a build that shares no sessions, asks for none and offers nothing', async () => {
    const { store, gateway } = await sharingOver({ fetchBuild: vi.fn().mockResolvedValue({ ...SHARING_BUILD, sharesSessions: false }) });

    expect(store.isAvailable()).toBe(false);
    expect(gateway.listSessions).not.toHaveBeenCalled();
    expect(store.sessions()).toEqual([]);
  });

  it('load, in a build that shares sessions, reads the sessions this app owns, by analysis', async () => {
    const { store } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });

    expect(store.isAvailable()).toBe(true);
    expect(store.sessionsByAnalysis().get('a1')?.revision).toBe(1);
  });

  it('refresh, when the sessions cannot be read, keeps the ones it knew', async () => {
    const { store, gateway } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });
    vi.mocked(gateway.listSessions).mockRejectedValueOnce(new Error('offline'));

    await store.refresh();

    expect(store.sessions()).toHaveLength(1);
  });

  it('refresh, when a session it knew is gone, drops it and says it ended after an hour without activity', async () => {
    const { store, gateway } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });
    vi.mocked(gateway.listSessions).mockResolvedValueOnce([]);

    await store.refresh();

    expect(store.sessions()).toEqual([]);
    expect(TestBed.inject(ToastStore).message()).toBe('the live session ended after an hour without activity');
  });

  it('start creates the session, keeps it, and holds the analysis busy only while it is being created', async () => {
    const { store } = await sharingOver();

    const starting = store.start('a1', NO_LOG);
    const busyWhileStarting = store.busyAnalysisIds().has('a1');
    const session = await starting;

    expect(busyWhileStarting).toBe(true);
    expect(store.busyAnalysisIds().has('a1')).toBe(false);
    expect(session?.sessionId).toBe(sessionStatusDtoFixture().sessionId);
    expect(store.sessionsByAnalysis().get('a1')).toEqual(session);
  });

  it.each([
    { status: 413, message: 'these files are too large to share live: 256 MB at most' },
    { status: 429, message: 'too many live links were created from here: try again in a minute' },
    { status: 502, message: 'the sharing server could not be reached' },
    { status: 500, message: 'the live link could not be created' },
  ])('start, refused with $status, keeps no session and says why', async ({ status, message }) => {
    const { store } = await sharingOver({ startSession: vi.fn().mockRejectedValue(failingWith(status)) });

    const session = await store.start('a1', NO_LOG);

    expect(session).toBeNull();
    expect(store.sessions()).toEqual([]);
    expect(store.busyAnalysisIds().size).toBe(0);
    expect(TestBed.inject(ToastStore).message()).toBe(message);
  });

  it('publish replaces the session with its newer revision', async () => {
    const { store } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });

    const published = await store.publish('a1', NO_LOG);

    expect(published?.revision).toBe(2);
    expect(store.sessions()).toEqual([published]);
  });

  it('publish, for a session the server no longer has, drops it and says it ended', async () => {
    const { store } = await sharingOver({
      listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]),
      publishSession: vi.fn().mockRejectedValue(failingWith(404)),
    });

    const published = await store.publish('a1', NO_LOG);

    expect(published).toBeNull();
    expect(store.sessions()).toEqual([]);
    expect(TestBed.inject(ToastStore).message()).toBe('the live session ended after an hour without activity');
  });

  it('publish, when the server cannot be reached, keeps the session and says the latest changes were not sent', async () => {
    const { store } = await sharingOver({
      listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]),
      publishSession: vi.fn().mockRejectedValue(failingWith(502)),
    });

    await store.publish('a1', NO_LOG);

    expect(store.sessions()).toHaveLength(1);
    expect(TestBed.inject(ToastStore).message()).toBe('the latest changes could not be sent to the live session');
  });

  it('end ends the session, drops it and says everything was erased', async () => {
    const { store, gateway } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });

    const isEnded = await store.end('a1');

    expect(isEnded).toBe(true);
    expect(gateway.endSession).toHaveBeenCalledWith('a1');
    expect(store.sessions()).toEqual([]);
    expect(TestBed.inject(ToastStore).message()).toBe('live session ended: everything was erased from the server');
  });

  it('end, when the session could not be ended, keeps it and says so', async () => {
    const { store } = await sharingOver({
      listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]),
      endSession: vi.fn().mockRejectedValue(new Error('offline')),
    });

    const isEnded = await store.end('a1');

    expect(isEnded).toBe(false);
    expect(store.sessions()).toHaveLength(1);
    expect(TestBed.inject(ToastStore).message()).toBe('the live session could not be ended');
  });

  it('while a session is live, asks for the sessions again every minute, and stops once none is left', async () => {
    vi.useFakeTimers();
    const { store, gateway } = await sharingOver({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });
    TestBed.tick();

    await vi.advanceTimersByTimeAsync(STATUS_POLLING_MILLISECONDS);
    const askedWhileLive = vi.mocked(gateway.listSessions).mock.calls.length;
    await store.end('a1');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(STATUS_POLLING_MILLISECONDS * 3);

    expect(askedWhileLive).toBe(2);
    expect(gateway.listSessions).toHaveBeenCalledTimes(2);
  });
});
