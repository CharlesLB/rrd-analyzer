import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
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

  it('answers an address that does not exist with the not-found page, on the address that was asked for', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/nowhere/at/all');
    fixture.detectChanges();

    expect(router.url).toBe('/nowhere/at/all');
    expect(fixture.nativeElement.querySelector('app-not-found-page')).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Page not found · RRD Analyzer');
  });

  it('renders the not-found page at the address the build turns into 404.html', async () => {
    const fixture = TestBed.createComponent(AppComponent);

    await TestBed.inject(Router).navigateByUrl('/not-found');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-not-found-page')).not.toBeNull();
  });
});
