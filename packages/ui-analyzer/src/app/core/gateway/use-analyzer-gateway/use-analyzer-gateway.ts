import { inject, injectAsync, onIdle, type ProviderToken } from '@angular/core';
import type { Edition } from '../../config/edition.model';
import { APPLICATION_EDITION } from '../../config/edition.token';
import type { AnalyzerGateway } from '../analyzer.gateway';
import { isDesktopRuntime } from '../desktop-runtime/desktop-runtime';

export type GatewayOperation = <TResult>(operation: (gateway: AnalyzerGateway) => Promise<TResult> | TResult) => Promise<TResult>;

const loadDesktopGateway = async (): Promise<ProviderToken<AnalyzerGateway>> => (await import('../desktop-gateway/desktop.gateway')).DesktopGateway;

const loadBrowserGateway = async (): Promise<ProviderToken<AnalyzerGateway>> => (await import('../browser-gateway/browser.gateway')).BrowserGateway;

const loadWebAssemblyGateway = async (): Promise<ProviderToken<AnalyzerGateway>> =>
  (await import('../web-assembly-gateway/web-assembly.gateway')).WebAssemblyGateway;

const loadGatewayOf = async (edition: Edition): Promise<ProviderToken<AnalyzerGateway>> => {
  if (isDesktopRuntime()) {
    return await loadDesktopGateway();
  }

  return edition.runsInTheBrowser ? await loadWebAssemblyGateway() : await loadBrowserGateway();
};

export const useAnalyzerGateway = (): GatewayOperation => {
  const edition = inject(APPLICATION_EDITION);
  const loadGateway = injectAsync(async () => await loadGatewayOf(edition), { prefetch: onIdle });

  return async <TResult>(operation: (gateway: AnalyzerGateway) => Promise<TResult> | TResult): Promise<TResult> => await operation(await loadGateway());
};
