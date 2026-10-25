import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, provideGatewayStub } from '../../core/gateway/analyzer.gateway.fixture';
import { WorkspaceStore } from '../../stores/workspace/store/workspace-store/workspace.store';
import { WorkspacePageComponent } from './pages/workspace-page/workspace-page.component';
import { workspaceRoutes } from './workspace.routes';

describe('workspaceRoutes', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'workspace', children: workspaceRoutes },
            { path: '', children: [] },
          ],
          withComponentInputBinding(),
        ),
        provideGatewayStub(analyzerGatewayStub()),
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('workspaceRoutes send a workspace address that names no analysis back to the library', async () => {
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/workspace');

    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('workspaceRoutes open the analysis the address names in a workspace page with stores of its own, under the title of the workspace', async () => {
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/workspace/a1', WorkspacePageComponent);

    expect(page.analysisId()).toBe('a1');
    expect(TestBed.inject(Title).getTitle()).toBe(messagesFor().application.workspaceTitle);
    expect(() => TestBed.inject(WorkspaceStore)).toThrow();
  });
});
