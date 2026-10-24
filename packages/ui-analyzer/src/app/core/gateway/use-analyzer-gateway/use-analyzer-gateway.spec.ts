import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edition } from '../../config/edition.model';
import { APPLICATION_EDITION } from '../../config/edition.token';
import type { AnalyzerGateway } from '../analyzer.gateway';
import { BrowserGateway } from '../browser-gateway/browser.gateway';
import { DesktopGateway } from '../desktop-gateway/desktop.gateway';
import { WebAssemblyGateway } from '../web-assembly-gateway/web-assembly.gateway';
import { useAnalyzerGateway } from './use-analyzer-gateway';

const BROWSER_EDITION: Edition = { runsInTheBrowser: true, offlineDownloadUrl: '/#download' };

const gatewayReachedIn = async (edition?: Edition): Promise<AnalyzerGateway> => {
  TestBed.configureTestingModule({ providers: edition === undefined ? [] : [{ provide: APPLICATION_EDITION, useValue: edition }] });

  const withGateway = TestBed.runInInjectionContext(() => useAnalyzerGateway());

  return await withGateway((gateway) => gateway);
};

describe('useAnalyzerGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('useAnalyzerGateway in the development build reaches the analyzer through the development server', async () => {
    const gateway = await gatewayReachedIn();

    expect(gateway).toBeInstanceOf(BrowserGateway);
  });

  it('useAnalyzerGateway in the browser edition runs the analyzer inside the page', async () => {
    const gateway = await gatewayReachedIn(BROWSER_EDITION);

    expect(gateway).toBeInstanceOf(WebAssemblyGateway);
  });

  it('useAnalyzerGateway inside the desktop window reaches the analyzer through the desktop bindings, whatever the edition', async () => {
    vi.stubGlobal('go', { desktop: { API: {} } });

    const gateway = await gatewayReachedIn(BROWSER_EDITION);

    expect(gateway).toBeInstanceOf(DesktopGateway);
  });

  it('useAnalyzerGateway answers with what the operation run on the gateway answered', async () => {
    TestBed.configureTestingModule({});
    const withGateway = TestBed.runInInjectionContext(() => useAnalyzerGateway());

    const answered = await withGateway(async (gateway) => await gateway.describeFiles([new File(['RRD'], 'cpu.rrd')]));

    expect(answered).toEqual([{ name: 'cpu.rrd', path: '', size: 3 }]);
  });
});
