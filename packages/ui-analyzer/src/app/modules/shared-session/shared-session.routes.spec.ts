import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, provideGatewayStub } from '../../core/gateway/analyzer.gateway.fixture';
import { SharedSessionPageComponent } from './pages/shared-session-page/shared-session-page.component';
import { sharedSessionRoutes } from './shared-session.routes';

describe('sharedSessionRoutes', () => {
  it('sharedSessionRoutes open the session and key the link names, under the title of a live session', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'shared', children: sharedSessionRoutes }], withComponentInputBinding()),
        provideGatewayStub(analyzerGatewayStub({ joinSession: vi.fn().mockReturnValue(new Promise(() => undefined)) })),
      ],
    });
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/shared/session-1/key-1', SharedSessionPageComponent);

    expect(page.sessionId()).toBe('session-1');
    expect(page.key()).toBe('key-1');
    expect(TestBed.inject(Title).getTitle()).toBe(messagesFor().sharing.viewer.banner);
  });
});
