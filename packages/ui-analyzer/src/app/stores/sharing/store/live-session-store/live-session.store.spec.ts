import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionStatusDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  buildDtoFixture,
  bundleDtoFixture,
  FIXTURE_SESSION_ID,
  joinedSessionDtoFixture,
  provideGatewayStub,
  sessionStatusDtoFixture,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { failingWith } from '../../../../core/gateway/gateway-request-error/gateway-request-error.fixture';
import { LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { deferredPromise } from '../../../../shared/utils/deferred-promise/deferred-promise.fixture';
import { InsightsStore } from '../../../insights/store/insights-store/insights.store';
import { LogsStore } from '../../../logs/store/logs-store/logs.store';
import { logFileFixture } from '../../../logs/store/logs-store/logs.store.fixture';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { SharedSessionStore } from '../shared-session-store/shared-session.store';
import { SharingStore } from '../sharing-store/sharing.store';
import { LiveSessionStore, PUBLICATION_DELAY_MILLISECONDS } from './live-session.store';

type Setup = {
  readonly isLive?: boolean;
  readonly sharesSessions?: boolean;
  readonly gateway?: Partial<AnalyzerGateway>;
};

const stubClipboard = (writeText: () => Promise<void>): void => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(writeText) } });
};

const liveOver = async ({ isLive = false, sharesSessions = true, gateway: overrides = {} }: Setup = {}) => {
  const gateway = analyzerGatewayStub({
    fetchBuild: vi.fn().mockResolvedValue(buildDtoFixture({ sharesSessions })),
    listSessions: vi.fn().mockResolvedValue(isLive ? [sessionStatusDtoFixture()] : []),
    openAnalysis: vi.fn().mockImplementation((analysisId: string) => Promise.resolve(bundleDtoFixture(5, { analysisId }))),
    ...overrides,
  });

  TestBed.configureTestingModule({
    providers: [
      provideGatewayStub(gateway),
      { provide: LiveUpdatesChannel, useValue: { watch: vi.fn().mockReturnValue(() => undefined) } },
      WorkspaceStore,
      SeriesDataStore,
      TimeWindowStore,
      InsightsStore,
      LogsStore,
      LiveSessionStore,
    ],
  });

  const live = TestBed.inject(LiveSessionStore);
  const workspace = TestBed.inject(WorkspaceStore);

  await TestBed.inject(SharingStore).load();
  await workspace.open('a1');
  TestBed.tick();

  return { live, workspace, gateway, logs: TestBed.inject(LogsStore), toasts: TestBed.inject(ToastStore) };
};

const changeAndSettle = async (change: () => unknown): Promise<void> => {
  await change();
  TestBed.tick();
  await vi.advanceTimersByTimeAsync(PUBLICATION_DELAY_MILLISECONDS);
};

describe('LiveSessionStore', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('offering to share', () => {
    it('canShare, for an open analysis in a build that shares sessions, offers it', async () => {
      const { live } = await liveOver();

      expect(live.canShare()).toBe(true);
      expect(live.session()).toBeNull();
    });

    it('canShare, in a build that shares no sessions, offers nothing', async () => {
      const { live } = await liveOver({ sharesSessions: false });

      expect(live.canShare()).toBe(false);
    });

    it('canShare, for an analysis opened from a live link, offers nothing, since it already follows someone else', async () => {
      const { live } = await liveOver({ gateway: { joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture()) } });

      await TestBed.inject(SharedSessionStore).join(FIXTURE_SESSION_ID, 'key');

      expect(live.canShare()).toBe(false);
    });

    it('canShare, before any analysis is open, offers nothing', () => {
      TestBed.configureTestingModule({
        providers: [provideGatewayStub(analyzerGatewayStub()), WorkspaceStore, SeriesDataStore, TimeWindowStore, InsightsStore, LogsStore, LiveSessionStore],
      });

      expect(TestBed.inject(LiveSessionStore).canShare()).toBe(false);
    });

    it('requestShare, for an analysis not live, opens the warning first, and closeLayer closes it', async () => {
      const { live } = await liveOver();

      live.requestShare();
      const isWarningOpen = live.isWarningOpen();
      live.closeLayer();

      expect(isWarningOpen).toBe(true);
      expect(live.isWarningOpen()).toBe(false);
      expect(live.isPanelOpen()).toBe(false);
    });

    it('requestShare, for an analysis already live, opens the share panel', async () => {
      const { live } = await liveOver({ isLive: true });

      live.requestShare();

      expect(live.isPanelOpen()).toBe(true);
      expect(live.isWarningOpen()).toBe(false);
    });
  });

  describe('starting', () => {
    it('confirm creates the link once the analysis is stored, opens the panel and copies the link', async () => {
      stubClipboard(async () => undefined);
      const { live, gateway, toasts } = await liveOver();
      live.requestShare();

      const isStarted = await live.confirm();

      expect(isStarted).toBe(true);
      expect(gateway.startSession).toHaveBeenCalledWith('a1', { log: null });
      expect(live.isPanelOpen()).toBe(true);
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sessionStatusDtoFixture().link);
      expect(toasts.message()).toBe('live link created and copied');
    });

    it('confirm, when the link cannot be copied, still creates it and says so', async () => {
      stubClipboard(async () => {
        throw new Error('blocked');
      });
      const { live, toasts } = await liveOver();

      await live.confirm();

      expect(toasts.message()).toBe('live link created');
    });

    it('confirm, with logs open, publishes the log with its content and how it is shown', async () => {
      stubClipboard(async () => undefined);
      const { live, logs, gateway } = await liveOver();
      await logs.load(logFileFixture());
      logs.confirmSetup();

      await live.confirm();

      expect(gateway.startSession).toHaveBeenCalledWith('a1', {
        log: expect.objectContaining({ name: 'atlas-api-logs.json', content: expect.stringContaining('Config reloaded') }),
      });
      expect(live.hasLog()).toBe(true);
    });

    it('confirm, when the link cannot be created, leaves the warning open', async () => {
      const { live } = await liveOver({ gateway: { startSession: vi.fn().mockRejectedValue(failingWith(502)) } });
      live.requestShare();

      const isStarted = await live.confirm();

      expect(isStarted).toBe(false);
      expect(live.isWarningOpen()).toBe(true);
    });
  });

  describe('the open session', () => {
    it('end ends the session and closes the panel', async () => {
      const { live } = await liveOver({ isLive: true });
      live.requestShare();

      const isEnded = await live.end();

      expect(isEnded).toBe(true);
      expect(live.session()).toBeNull();
      expect(live.isPanelOpen()).toBe(false);
    });

    it('end, when the session could not be ended, keeps the panel open', async () => {
      const { live } = await liveOver({ isLive: true, gateway: { endSession: vi.fn().mockRejectedValue(new Error('offline')) } });
      live.requestShare();

      const isEnded = await live.end();

      expect(isEnded).toBe(false);
      expect(live.isPanelOpen()).toBe(true);
    });

    it('copyLink copies the link of the open session and says so', async () => {
      stubClipboard(async () => undefined);
      const { live, toasts } = await liveOver({ isLive: true });

      const isCopied = await live.copyLink();

      expect(isCopied).toBe(true);
      expect(toasts.message()).toBe('link copied');
    });

    it('copyLink, when the browser refuses, says the link could not be copied', async () => {
      stubClipboard(async () => {
        throw new Error('blocked');
      });
      const { live, toasts } = await liveOver({ isLive: true });

      const isCopied = await live.copyLink();

      expect(isCopied).toBe(false);
      expect(toasts.message()).toBe('the link could not be copied');
    });

    it('copyLink, with no session open, copies nothing', async () => {
      stubClipboard(async () => undefined);
      const { live } = await liveOver();

      expect(await live.copyLink()).toBe(false);
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  describe('publishing changes', () => {
    it.each([
      { name: 'a chart added', change: (workspace: WorkspaceStore) => workspace.addToCanvas('s3') },
      { name: 'a series recolored', change: (workspace: WorkspaceStore) => workspace.recolorSeries('s0', '#123456') },
      { name: 'the analysis renamed', change: async (workspace: WorkspaceStore) => await workspace.rename('renamed') },
    ])('$name, while the analysis is live, is published once it settles', async ({ change }) => {
      vi.useFakeTimers();
      const { workspace, gateway } = await liveOver({ isLive: true });

      await changeAndSettle(() => change(workspace));

      expect(gateway.publishSession).toHaveBeenCalledTimes(1);
      expect(gateway.publishSession).toHaveBeenCalledWith('a1', { log: null });
    });

    it('changes made close together are published together', async () => {
      vi.useFakeTimers();
      const { workspace, gateway } = await liveOver({ isLive: true });

      workspace.addToCanvas('s3');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(PUBLICATION_DELAY_MILLISECONDS / 2);
      await changeAndSettle(() => workspace.addToCanvas('s4'));

      expect(gateway.publishSession).toHaveBeenCalledTimes(1);
    });

    it('a change to an analysis that is not live is published nowhere', async () => {
      vi.useFakeTimers();
      const { workspace, gateway } = await liveOver();

      await changeAndSettle(() => workspace.addToCanvas('s3'));

      expect(gateway.publishSession).not.toHaveBeenCalled();
    });

    it('a log opened while live is sent with its content, and a later change to how it is shown is sent without it', async () => {
      vi.useFakeTimers();
      const { logs, gateway } = await liveOver({ isLive: true });

      await changeAndSettle(async () => {
        await logs.load(logFileFixture());
        logs.confirmSetup();
      });
      await changeAndSettle(() => logs.toggleType('info'));

      const [first, second] = vi.mocked(gateway.publishSession).mock.calls.map(([, publication]) => publication.log);

      expect(first).toEqual(expect.objectContaining({ name: 'atlas-api-logs.json', content: expect.any(String) }));
      expect(second).not.toHaveProperty('content');
      expect(second?.view).toEqual(expect.objectContaining({ hiddenTypes: ['info'] }));
    });

    it('a log whose publication failed is sent with its content again next time', async () => {
      vi.useFakeTimers();
      const { logs, gateway } = await liveOver({ isLive: true });
      vi.mocked(gateway.publishSession).mockRejectedValueOnce(failingWith(502));

      await changeAndSettle(async () => {
        await logs.load(logFileFixture());
        logs.confirmSetup();
      });
      await changeAndSettle(() => logs.toggleType('info'));

      expect(vi.mocked(gateway.publishSession).mock.calls.at(-1)?.[1].log).toHaveProperty('content');
    });

    it('a change made while the previous one is still being published waits for it, then is published too', async () => {
      vi.useFakeTimers();
      const publishing = deferredPromise<SessionStatusDto>();
      const { workspace, gateway } = await liveOver({ isLive: true });
      vi.mocked(gateway.publishSession).mockReturnValueOnce(publishing.promise);

      await changeAndSettle(() => workspace.addToCanvas('s3'));
      await changeAndSettle(() => workspace.addToCanvas('s4'));
      const publishedMeanwhile = vi.mocked(gateway.publishSession).mock.calls.length;
      publishing.settle(sessionStatusDtoFixture({ revision: 2 }));
      await vi.advanceTimersByTimeAsync(0);

      expect(publishedMeanwhile).toBe(1);
      expect(gateway.publishSession).toHaveBeenCalledTimes(2);
    });

    it('a change still waiting when another analysis is opened is published at once, for the analysis it was made in', async () => {
      vi.useFakeTimers();
      const { workspace, gateway } = await liveOver({ isLive: true });

      workspace.addToCanvas('s3');
      TestBed.tick();
      await workspace.open('a2');
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);

      expect(gateway.publishSession).toHaveBeenCalledTimes(1);
      expect(gateway.publishSession).toHaveBeenCalledWith('a1', { log: null });
    });

    it('a change still waiting when the workspace closes is published at once', async () => {
      vi.useFakeTimers();

      const gateway = analyzerGatewayStub({
        fetchBuild: vi.fn().mockResolvedValue(buildDtoFixture({ sharesSessions: true })),
        listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]),
      });

      TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
      await TestBed.inject(SharingStore).load();

      const route = createEnvironmentInjector(
        [WorkspaceStore, SeriesDataStore, TimeWindowStore, InsightsStore, LogsStore, LiveSessionStore],
        TestBed.inject(EnvironmentInjector),
      );

      const workspace = route.get(WorkspaceStore);
      route.get(LiveSessionStore);
      await workspace.open('a1');
      TestBed.tick();

      workspace.addToCanvas('s3');
      TestBed.tick();
      route.destroy();
      await vi.advanceTimersByTimeAsync(0);

      expect(gateway.publishSession).toHaveBeenCalledTimes(1);
    });

    it('a change waiting for a session that ended meanwhile is published nowhere', async () => {
      vi.useFakeTimers();
      const { live, workspace, gateway } = await liveOver({ isLive: true });

      workspace.addToCanvas('s3');
      TestBed.tick();
      await live.end();
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(PUBLICATION_DELAY_MILLISECONDS);

      expect(gateway.publishSession).not.toHaveBeenCalled();
    });
  });
});
