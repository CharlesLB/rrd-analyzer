import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { BuildStore } from './build.store';

const configureWith = (gateway: AnalyzerGateway): BuildStore => {
  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });

  return TestBed.inject(BuildStore);
};

describe('BuildStore', () => {
  let gateway: AnalyzerGateway;

  beforeEach(() => {
    gateway = analyzerGatewayStub();
  });

  it('holds the one-line summary the daemon was stamped with', async () => {
    const store = configureWith(gateway);

    await store.load();

    expect(store.summary()).toBe('1.4.0 (abcdef0)');
  });

  it('says whether this build shares live sessions, as the daemon was built to', async () => {
    gateway = analyzerGatewayStub({
      fetchBuild: vi.fn().mockResolvedValue({ version: '1.4.0', commit: 'none', date: 'unknown', summary: '1.4.0', sharesSessions: true }),
    });
    const store = configureWith(gateway);

    await store.load();

    expect(store.sharesSessions()).toBe(true);
  });

  it('shares no live sessions until the daemon has said it can', () => {
    const store = configureWith(gateway);

    expect(store.sharesSessions()).toBe(false);
  });

  it('asks the daemon once however many times the page loads it, since the build never changes', async () => {
    const store = configureWith(gateway);

    await store.load();
    await store.load();

    expect(gateway.fetchBuild).toHaveBeenCalledTimes(1);
  });

  it('shows no version when the daemon cannot answer, and asks again on the next load', async () => {
    gateway = analyzerGatewayStub({
      fetchBuild: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ summary: '1.4.0', sharesSessions: false }),
    });
    const store = configureWith(gateway);

    await store.load();
    expect(store.summary()).toBeUndefined();

    await store.load();
    expect(store.summary()).toBe('1.4.0');
  });
});
