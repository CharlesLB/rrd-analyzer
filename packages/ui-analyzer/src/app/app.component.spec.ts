import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppComponent } from './app.component';
import { APPLICATION_EDITION } from './core/config/edition.token';
import { elementOf, textOf } from './shared/utils/component-fixture/component-fixture.fixture';
import { ThemeStore } from './stores/theme/store/theme-store/theme.store';
import { stubBrowserStorage } from './stores/theme/store/theme-store/theme.store.fixture';
import { ToastStore } from './stores/toast/store/toast-store/toast.store';

describe('AppComponent', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('puts the dark class on the shell once the theme turns dark, so the tokens switch with it', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const shell = elementOf(fixture, '.app-shell');

    expect(shell?.classList.contains('dark')).toBe(false);

    TestBed.inject(ThemeStore).toggle();
    fixture.detectChanges();

    expect(shell?.classList.contains('dark')).toBe(true);
  });

  it('shows no browser notice in the desktop window or the development build', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.browser-edition-notice')).toBeNull();
  });

  it('tells a visitor of the browser edition that nothing is kept, and where the offline app is', () => {
    TestBed.overrideProvider(APPLICATION_EDITION, { useValue: { runsInTheBrowser: true, offlineDownloadUrl: '/#download' } });
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.browser-edition-notice')).not.toBeNull();
    expect(elementOf(fixture, '.browser-edition-notice-download')?.getAttribute('href')).toBe('/#download');
  });

  it('renders the toast the toast store is showing', () => {
    const fixture = TestBed.createComponent(AppComponent);
    TestBed.inject(ToastStore).show('analysis deleted');
    fixture.detectChanges();

    expect(textOf(fixture, '.toast-message')).toBe('analysis deleted');
  });

  it('keeps the toast on show while the pointer rests on it', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const toasts = TestBed.inject(ToastStore);
    toasts.show('analysis deleted');
    fixture.detectChanges();

    elementOf(fixture, '.toast')?.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(60_000);

    expect(toasts.message()).toBe('analysis deleted');

    elementOf(fixture, '.toast')?.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(2000);

    expect(toasts.message()).toBeNull();
    vi.useRealTimers();
  });

  it('runs the action of the toast when its button is pressed', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const run = vi.fn();
    TestBed.inject(ToastStore).show('charts merged', { label: 'Undo', run });
    fixture.detectChanges();

    elementOf(fixture, '.toast-action')?.click();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('refuses a file dropped where nothing takes it, so the window does not navigate to the file', () => {
    TestBed.createComponent(AppComponent).detectChanges();
    const transfer = { types: ['Files'], dropEffect: 'copy' };
    const stray = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: transfer });
    const taken = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { ...transfer } });
    const text = Object.assign(new Event('drop', { cancelable: true }), { dataTransfer: { types: ['text/plain'], dropEffect: 'copy' } });
    taken.preventDefault();

    window.dispatchEvent(stray);
    window.dispatchEvent(taken);
    window.dispatchEvent(text);

    expect(stray.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe('none');
    expect(taken.dataTransfer.dropEffect).toBe('copy');
    expect(text.defaultPrevented).toBe(false);
  });
});
