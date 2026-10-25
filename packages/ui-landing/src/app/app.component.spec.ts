import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { inMemoryStorage, stubSystemTheme } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', inMemoryStorage());
    stubSystemTheme(false);
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens on the landing page at the root of the site', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-home-page')).not.toBeNull();
  });

  it('sends an address that does not exist back to the landing page', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/nowhere');
    fixture.detectChanges();

    expect(router.url).toBe('/');
    expect(fixture.nativeElement.querySelector('app-home-page')).not.toBeNull();
  });
});
