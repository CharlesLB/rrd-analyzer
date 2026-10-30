import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  FIXTURE_SESSION_ID,
  joinedSessionDtoFixture,
  provideGatewayStub,
  sessionStatusDtoFixture,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { failingWith } from '../../../../core/gateway/gateway-request-error/gateway-request-error.fixture';
import type { LogView } from '../../../logs/models/log-view/log-view';
import { SHARE_FAILURES, ShareFailureError } from '../../models/share-failure/share-failure';
import { SharingRepository } from './sharing.repository';

const VIEW: LogView = { mapping: null, chosenColors: new Map([['error', '#cc3344']]), hiddenTypes: new Set(['debug']), isShown: true };
const WRITTEN_VIEW = { mapping: null, chosenColors: [['error', '#cc3344']], hiddenTypes: ['debug'], isShown: true };
const SHOWN_VIEW = { mapping: null, chosenColors: [], hiddenTypes: [], isShown: true };
const HIDDEN_VIEW = { ...SHOWN_VIEW, isShown: false };

const sharedLog = (fileId: string, view: unknown, content?: string) => ({
  fileId,
  name: `${fileId}.ndjson`,
  view,
  ...(content === undefined ? {} : { content }),
});

const repositoryOver = (gateway: AnalyzerGateway): SharingRepository => {
  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

  return TestBed.inject(SharingRepository);
};

describe('SharingRepository', () => {
  it('sessions reads every live session this app owns, each file marked online or not', async () => {
    const repository = repositoryOver(analyzerGatewayStub({ listSessions: vi.fn().mockResolvedValue([sessionStatusDtoFixture()]) }));

    const sessions = await repository.sessions();

    expect(sessions).toEqual([
      {
        analysisId: 'a1',
        sessionId: FIXTURE_SESSION_ID,
        link: sessionStatusDtoFixture().link,
        revision: 1,
        expiresAtMilliseconds: sessionStatusDtoFixture().expiresAtMilliseconds,
        files: [
          { name: 'atlas_metric_0.rrd', path: '/rrd/atlas_metric_0.rrd', isOnline: true },
          { name: 'atlas_metric_1.rrd', path: '/rrd/atlas_metric_1.rrd', isOnline: false },
        ],
        log: null,
      },
    ]);
  });

  it('start sends the content of a log not published yet, with how it is shown written as plain json', async () => {
    const gateway = analyzerGatewayStub({
      startSession: vi.fn().mockResolvedValue(sessionStatusDtoFixture({ log: { name: 'service.ndjson', online: true } })),
    });

    const repository = repositoryOver(gateway);

    const session = await repository.start('a1', { log: { file: new File(['{"level":"info"}'], 'service.ndjson'), view: VIEW, sendsContent: true } });

    expect(gateway.startSession).toHaveBeenCalledWith('a1', { log: { name: 'service.ndjson', content: '{"level":"info"}', view: WRITTEN_VIEW } });
    expect(session.log).toEqual({ name: 'service.ndjson', isOnline: true });
  });

  it('publish leaves out the content of a log the session already holds', async () => {
    const gateway = analyzerGatewayStub();
    const repository = repositoryOver(gateway);

    await repository.publish('a1', { log: { file: new File(['{}'], 'service.ndjson'), view: VIEW, sendsContent: false } });

    expect(gateway.publishSession).toHaveBeenCalledWith('a1', { log: { name: 'service.ndjson', view: WRITTEN_VIEW } });
  });

  it('publish, with no log open, publishes no log', async () => {
    const gateway = analyzerGatewayStub();

    const session = await repositoryOver(gateway).publish('a1', { log: null });

    expect(gateway.publishSession).toHaveBeenCalledWith('a1', { log: null });
    expect(session.revision).toBe(2);
  });

  it('end ends the session of the analysis', async () => {
    const gateway = analyzerGatewayStub();

    await repositoryOver(gateway).end('a1');

    expect(gateway.endSession).toHaveBeenCalledWith('a1');
  });

  it('join turns the log the session holds into a file, reads how it is shown and keeps what it was written as', async () => {
    const view = { mapping: null, chosenColors: [], hiddenTypes: [], isShown: false };

    const gateway = analyzerGatewayStub({
      joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: { fileId: 'f1', name: 'service.ndjson', content: '{"a":1}', view } })),
    });

    const followed = await repositoryOver(gateway).join(FIXTURE_SESSION_ID, 'key');

    expect(gateway.joinSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID, 'key');
    expect(followed.log?.fileId).toBe('f1');
    expect(followed.log?.file.name).toBe('service.ndjson');
    expect(await followed.log?.file.text()).toBe('{"a":1}');
    expect(followed.log?.view).toEqual({ mapping: null, chosenColors: new Map(), hiddenTypes: new Set(), isShown: false });
    expect(followed.log?.viewSignature).toBe(JSON.stringify(view));
  });

  it('refresh reads the latest revision of the session, with no log when it holds none', async () => {
    const gateway = analyzerGatewayStub({ refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 5, changed: false })) });

    const followed = await repositoryOver(gateway).refresh(FIXTURE_SESSION_ID);

    expect(followed).toMatchObject({ revision: 5, log: null, liveUrl: joinedSessionDtoFixture().liveUrl });
  });

  it('forget drops the session from this tab', async () => {
    const gateway = analyzerGatewayStub();

    await repositoryOver(gateway).forget(FIXTURE_SESSION_ID);

    expect(gateway.forgetSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID);
  });

  it('refresh, answered without the content of the log it already gave, keeps that file and how it is shown', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') })),
      refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 2, log: sharedLog('f1', SHOWN_VIEW) })),
    });

    const repository = repositoryOver(gateway);

    const joined = await repository.join(FIXTURE_SESSION_ID, 'key');
    const refreshed = await repository.refresh(FIXTURE_SESSION_ID);

    expect(refreshed.log).toBe(joined.log);
  });

  it('refresh, answered without the content of the log it already gave but shown another way, keeps the file and reads the new way', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') })),
      refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 2, log: sharedLog('f1', HIDDEN_VIEW) })),
    });

    const repository = repositoryOver(gateway);

    const joined = await repository.join(FIXTURE_SESSION_ID, 'key');
    const refreshed = await repository.refresh(FIXTURE_SESSION_ID);

    expect(refreshed.log?.file).toBe(joined.log?.file);
    expect(refreshed.log?.view?.isShown).toBe(false);
    expect(refreshed.log?.viewSignature).toBe(JSON.stringify(HIDDEN_VIEW));
  });

  it('refresh, answered with another log, turns its content into a new file', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') })),
      refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 2, log: sharedLog('f2', SHOWN_VIEW, '{"b":2}') })),
    });

    const repository = repositoryOver(gateway);

    await repository.join(FIXTURE_SESSION_ID, 'key');
    const refreshed = await repository.refresh(FIXTURE_SESSION_ID);

    expect(refreshed.log?.fileId).toBe('f2');
    expect(await refreshed.log?.file.text()).toBe('{"b":2}');
  });

  it('refresh, answered with another log that has no content, takes it as an empty log', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') })),
      refreshSession: vi.fn().mockResolvedValue(joinedSessionDtoFixture({ revision: 2, log: sharedLog('f2', SHOWN_VIEW) })),
    });

    const repository = repositoryOver(gateway);

    await repository.join(FIXTURE_SESSION_ID, 'key');
    const refreshed = await repository.refresh(FIXTURE_SESSION_ID);

    expect(refreshed.log?.fileId).toBe('f2');
    expect(await refreshed.log?.file.text()).toBe('');
  });

  it('join, again on a session this tab could not forget, keeps the log it already gave when the content is left out', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi
        .fn()
        .mockResolvedValueOnce(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') }))
        .mockResolvedValueOnce(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW) })),
      forgetSession: vi.fn().mockRejectedValue(new Error('still held')),
    });

    const repository = repositoryOver(gateway);

    const first = await repository.join(FIXTURE_SESSION_ID, 'key');
    await expect(repository.forget(FIXTURE_SESSION_ID)).rejects.toBeInstanceOf(ShareFailureError);
    const second = await repository.join(FIXTURE_SESSION_ID, 'key');

    expect(second.log?.file).toBe(first.log?.file);
  });

  it('join, on a session forgotten before, holds no earlier log, so a log left without content is taken as empty', async () => {
    const gateway = analyzerGatewayStub({
      joinSession: vi
        .fn()
        .mockResolvedValueOnce(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW, '{"a":1}') }))
        .mockResolvedValueOnce(joinedSessionDtoFixture({ log: sharedLog('f1', SHOWN_VIEW) })),
    });

    const repository = repositoryOver(gateway);

    await repository.join(FIXTURE_SESSION_ID, 'key');
    await repository.forget(FIXTURE_SESSION_ID);
    const second = await repository.join(FIXTURE_SESSION_ID, 'key');

    expect(await second.log?.file.text()).toBe('');
  });

  it.each([
    { name: 'a refusal of the gateway', error: failingWith(404), failure: SHARE_FAILURES.GONE },
    { name: 'any other error', error: new Error('offline'), failure: SHARE_FAILURES.OTHER },
  ])('a request that fails with $name rejects with the share failure it means, keeping what caused it', async ({ error, failure }) => {
    const repository = repositoryOver(analyzerGatewayStub({ refreshSession: vi.fn().mockRejectedValue(error) }));

    const rejection = await repository.refresh(FIXTURE_SESSION_ID).catch((reason: unknown) => reason);

    expect(rejection).toBeInstanceOf(ShareFailureError);
    expect(rejection).toMatchObject({ failure, cause: error });
  });
});
