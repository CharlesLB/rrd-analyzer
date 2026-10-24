import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzerGatewayStub, provideGatewayStub } from '../../core/gateway/analyzer.gateway.fixture';
import { stubBrowserStorage } from '../../stores/theme/store/theme-store/theme.store.fixture';
import { libraryRoutes } from './library.routes';
import { LibraryPageComponent } from './pages/library-page/library-page.component';

describe('libraryRoutes', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({ providers: [provideRouter(libraryRoutes), provideGatewayStub(analyzerGatewayStub())] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('libraryRoutes, at their root, show the library page under the title of the library', async () => {
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/', LibraryPageComponent);

    expect(page).toBeInstanceOf(LibraryPageComponent);
    expect(TestBed.inject(Title).getTitle()).toBe(messagesFor().application.libraryTitle);
  });
});
