import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, FIXTURE_SESSION_ID, joinedSessionDtoFixture, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { failingWith } from '../../../../core/gateway/gateway-request-error/gateway-request-error.fixture';
import { LiveUpdatesChannel } from '../../../../core/live-updates/live-updates.channel';
import { elementOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { SharedSessionPageComponent } from './shared-session-page.component';

const KEY = 'a2V5';

describe('SharedSessionPageComponent', () => {
  let gateway: AnalyzerGateway;
  let navigation: { navigate: ReturnType<typeof vi.spyOn>; navigateByUrl: ReturnType<typeof vi.spyOn> };

  const configure = (overrides: Partial<AnalyzerGateway> = {}): void => {
    gateway = analyzerGatewayStub(overrides);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideGatewayStub(gateway),
        { provide: LiveUpdatesChannel, useValue: { watch: vi.fn().mockReturnValue(() => undefined) } },
      ],
    });
    const router = TestBed.inject(Router);
    navigation = { navigate: vi.spyOn(router, 'navigate').mockResolvedValue(true), navigateByUrl: vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true) };
  };

  const renderPage = async () => {
    const fixture = TestBed.createComponent(SharedSessionPageComponent);
    fixture.componentRef.setInput('sessionId', FIXTURE_SESSION_ID);
    fixture.componentRef.setInput('key', KEY);
    fixture.detectChanges();
    await vi.waitFor(() => expect(gateway.joinSession).toHaveBeenCalled());
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(navigation.navigate.mock.calls.length > 0 || elementOf(fixture, '[role="alert"]') !== null).toBe(true);
    });

    return fixture;
  };

  beforeEach(() => {
    configure();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says the session is being opened while its files are downloaded', () => {
    const fixture = TestBed.createComponent(SharedSessionPageComponent);
    fixture.componentRef.setInput('sessionId', FIXTURE_SESSION_ID);
    fixture.componentRef.setInput('key', KEY);
    fixture.detectChanges();

    expect(textOf(fixture, '.shared-session-page-title')).toBe('Opening the live session…');
    expect(elementOf(fixture, '[role="status"]')).not.toBeNull();
  });

  it('joins the session named by the link and opens its analysis in place of the link, so the key leaves the address bar', async () => {
    await renderPage();

    expect(gateway.joinSession).toHaveBeenCalledWith(FIXTURE_SESSION_ID, KEY);
    expect(navigation.navigate).toHaveBeenCalledWith(['/workspace', joinedSessionDtoFixture().analysisId], { replaceUrl: true });
  });

  it.each([
    { status: 404, title: 'This link has expired', canRetry: false },
    { status: 422, title: 'This link is incomplete', canRetry: false },
    { status: 502, title: 'The live session could not be opened', canRetry: true },
  ])('for a link refused with $status, says "$title", offering to retry only when it might work', async ({ status, title, canRetry }) => {
    TestBed.resetTestingModule();
    configure({ joinSession: vi.fn().mockRejectedValue(failingWith(status)) });

    const fixture = await renderPage();

    expect(textOf(fixture, '.shared-session-page-title')).toBe(title);
    expect(elementOf(fixture, '.shared-session-page-retry') !== null).toBe(canRetry);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('tries again when asked, and opens the analysis once the server answers', async () => {
    TestBed.resetTestingModule();
    configure({ joinSession: vi.fn().mockRejectedValueOnce(failingWith(502)).mockResolvedValue(joinedSessionDtoFixture()) });
    const fixture = await renderPage();

    elementOf(fixture, '.shared-session-page-retry')?.click();
    await vi.waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(1));

    expect(gateway.joinSession).toHaveBeenCalledTimes(2);
  });

  it('goes to the library from a link that cannot be opened, leaving the link out of the history', async () => {
    TestBed.resetTestingModule();
    configure({ joinSession: vi.fn().mockRejectedValue(failingWith(404)) });
    const fixture = await renderPage();

    elementOf(fixture, '.shared-session-page-library')?.click();

    expect(navigation.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
  });
});
