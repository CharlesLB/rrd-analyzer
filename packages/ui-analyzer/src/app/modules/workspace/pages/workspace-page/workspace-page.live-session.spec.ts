import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MILLISECONDS_PER_MINUTE, MILLISECONDS_PER_SECOND } from '@rrd-analyzer/shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  buildDtoFixture,
  bundleDtoFixture,
  chartsDtoFixture,
  FIXTURE_SESSION_ID,
  joinedSessionDtoFixture,
  provideGatewayStub,
  sessionStatusDtoFixture,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { LIVE_UPDATE_KINDS, type LiveUpdate, LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { elementOf, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogsStore } from '../../../../stores/logs/store/logs-store/logs.store';
import { logRecordsFixture } from '../../../../stores/logs/store/logs-store/logs.store.fixture';
import { SharedSessionStore } from '../../../../stores/sharing/store/shared-session-store/shared-session.store';
import { WORKSPACE_PAGE_PROVIDERS } from '../../workspace.routes';
import { renderWorkspacePage, type WorkspacePageFixture } from './workspace-page.fixture';

const LOG_CONTENT = JSON.stringify(logRecordsFixture());
const DETECTED_MAPPING = { timestamp: '@timestamp', type: 'lvl', message: 'event.msg' };
const PLACED_VIEW = { mapping: DETECTED_MAPPING, chosenColors: [], hiddenTypes: ['info'], isShown: true };

const sharedLogOf = (fileId: string, view: unknown, content = LOG_CONTENT) => ({ fileId, name: 'atlas-api-logs.json', content, view });

const settle = async (fixture: WorkspacePageFixture): Promise<void> => {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('WorkspacePageComponent live sessions', () => {
  let gateway: AnalyzerGateway;
  let deliver: (update: LiveUpdate) => void;

  const configure = (overrides: Partial<AnalyzerGateway> = {}): void => {
    gateway = analyzerGatewayStub({
      fetchBuild: vi.fn().mockResolvedValue(buildDtoFixture({ sharesSessions: true })),
      openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(4, { canvas: chartsDtoFixture('s0', 's1') })),
      ...overrides,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideGatewayStub(gateway),
        {
          provide: LiveUpdatesChannel,
          useValue: {
            watch: (_url: string, listener: (update: LiveUpdate) => void) => {
              deliver = listener;

              return () => undefined;
            },
          },
        },
        ...WORKSPACE_PAGE_PROVIDERS,
      ],
    });
  };

  beforeEach(() => {
    stubBrowserStorage();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true });
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('in a build that shares no sessions, offers no way to share', async () => {
    configure({ fetchBuild: vi.fn().mockResolvedValue(buildDtoFixture()) });

    const fixture = await renderWorkspacePage();

    expect(elementOf(fixture, 'app-share-trigger')).toBeNull();
  });

  it('warns before sharing, creates the link once confirmed, and shows it with every file marked', async () => {
    configure();
    const fixture = await renderWorkspacePage();

    elementOf(fixture, '.share-trigger')?.click();
    await settle(fixture);
    const warning = textOf(fixture, '.share-warning-dialog .modal-dialog-title');
    elementOf(fixture, '.share-warning-dialog-confirm')?.click();
    await vi.waitFor(() => expect(gateway.startSession).toHaveBeenCalledWith('a1', { log: null }));
    await settle(fixture);

    expect(warning).toBe('Share this analysis live?');
    expect(elementOf(fixture, '.share-warning-dialog')).toBeNull();
    expect(elementOf(fixture, '.share-panel-link-field')).toHaveProperty('value', sessionStatusDtoFixture().link);
    expect(textsOf(fixture, '.share-panel-state')).toEqual(['online', 'local']);
    expect(elementOf(fixture, '.share-trigger-live')).not.toBeNull();
  });

  it('copies the link and ends the session from the panel, which closes once the session is over', async () => {
    configure({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });
    const fixture = await renderWorkspacePage();
    elementOf(fixture, '.share-trigger-live')?.click();
    await settle(fixture);

    elementOf(fixture, '.share-panel-link-copy')?.click();
    elementOf(fixture, '.share-panel-end')?.click();
    await vi.waitFor(() => expect(gateway.endSession).toHaveBeenCalledWith('a1'));
    await settle(fixture);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(sessionStatusDtoFixture().link);
    expect(elementOf(fixture, '.share-panel')).toBeNull();
    expect(elementOf(fixture, '.share-trigger-live')).toBeNull();
  });

  it('closes the warning without sharing when it is cancelled', async () => {
    configure();
    const fixture = await renderWorkspacePage();
    elementOf(fixture, '.share-trigger')?.click();
    await settle(fixture);

    elementOf(fixture, '.share-warning-dialog-cancel')?.click();
    await settle(fixture);

    expect(elementOf(fixture, '.share-warning-dialog')).toBeNull();
    expect(gateway.startSession).not.toHaveBeenCalled();
  });

  it('closes the panel from its close button and leaves the session live', async () => {
    configure({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) });
    const fixture = await renderWorkspacePage();
    elementOf(fixture, '.share-trigger-live')?.click();
    await settle(fixture);

    elementOf(fixture, '.share-panel .modal-dialog-close')?.click();
    await settle(fixture);

    expect(elementOf(fixture, '.share-panel')).toBeNull();
    expect(gateway.endSession).not.toHaveBeenCalled();
  });

  describe('following a live link', () => {
    const follow = async (overrides: Partial<AnalyzerGateway> = {}) => {
      configure(overrides);
      await TestBed.inject(SharedSessionStore).join(FIXTURE_SESSION_ID, 'key');

      return await renderWorkspacePage();
    };

    it('says the analysis follows a live session, offers no way to share it again, and places its log as it was shared', async () => {
      const fixture = await follow({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLogOf('f1', PLACED_VIEW) })) });
      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('ready'));
      fixture.detectChanges();

      expect(textOf(fixture, '.live-session-banner-label')).toBe('Live session');
      expect(textOf(fixture, '.live-session-banner-expiry')).toBe('erased 0 minutes after the last activity');
      expect(elementOf(fixture, 'app-share-trigger')).toBeNull();
      expect(TestBed.inject(LogsStore).hiddenTypes()).toEqual(new Set(['info']));
    });

    it('places a shared log that comes with no readable view by the fields it detects', async () => {
      await follow({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLogOf('f1', 'unreadable') })) });

      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('ready'));

      expect(TestBed.inject(LogsStore).appliedMapping()).toEqual(DETECTED_MAPPING);
    });

    it('leaves a shared log that cannot be read in its setup', async () => {
      await follow({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLogOf('f1', PLACED_VIEW, 'not json') })) });

      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('failed'));
    });

    it('takes each newer revision: opens the analysis again and shows the log the way it is now shown', async () => {
      const fixture = await follow({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLogOf('f1', PLACED_VIEW) })) });
      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('ready'));
      vi.mocked(gateway.refreshSession).mockResolvedValueOnce(
        joinedSessionDtoFixture({
          revision: 2,
          expiresAtMilliseconds: Date.now() + 30 * MILLISECONDS_PER_MINUTE - MILLISECONDS_PER_SECOND,
          log: sharedLogOf('f1', { ...PLACED_VIEW, hiddenTypes: [] }),
        }),
      );

      deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 0 });
      await vi.waitFor(() => expect(gateway.openAnalysis).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(TestBed.inject(LogsStore).hiddenTypes()).toEqual(new Set()));
      fixture.detectChanges();

      expect(textOf(fixture, '.live-session-banner-expiry')).toBe('erased 30 minutes after the last activity');
    });

    it('takes the log away when the owner removed it', async () => {
      await follow({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLogOf('f1', PLACED_VIEW) })) });
      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('ready'));
      vi.mocked(gateway.refreshSession).mockResolvedValueOnce(joinedSessionDtoFixture({ revision: 2, log: null }));

      deliver({ kind: LIVE_UPDATE_KINDS.REVISION, revision: 2, expiresAtMilliseconds: 0 });

      await vi.waitFor(() => expect(TestBed.inject(LogsStore).status()).toBe('none'));
    });

    it('goes back to the library once the session ends', async () => {
      await follow();
      const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });

      await vi.waitFor(() => expect(navigation).toHaveBeenCalledWith('/'));
      expect(TestBed.inject(SharedSessionStore).endedAnalysisId()).toBeNull();
    });

    it('stays where it is when a session followed for another analysis ends', async () => {
      configure({ joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ analysisId: 'a2' })) });
      await TestBed.inject(SharedSessionStore).join(FIXTURE_SESSION_ID, 'key');
      await renderWorkspacePage();
      const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      deliver({ kind: LIVE_UPDATE_KINDS.EXPIRED });
      await vi.waitFor(() => expect(TestBed.inject(SharedSessionStore).endedAnalysisId()).toBe('a2'));

      expect(navigation).not.toHaveBeenCalled();
    });
  });
});
