import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeStore } from './theme.store';
import { inMemoryStorage, stubSystemTheme } from './theme.store.fixture';

describe('ThemeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', inMemoryStorage());
    stubSystemTheme(false);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the theme the system is set to on a first launch', () => {
    stubSystemTheme(true);

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
  });

  it('wears light on a first launch under a light system, and names that theme on the shell', () => {
    const store = TestBed.inject(ThemeStore);

    expect(store.theme()).toBe('light');
    expect(store.themeClass()).toBe('light');
  });

  it('follows the system while nobody has chosen a theme', () => {
    const system = stubSystemTheme(false);
    const store = TestBed.inject(ThemeStore);

    system.switchTo(true);

    expect(store.isDark()).toBe(true);
  });

  it('toggles to dark and back, naming each theme on the shell', () => {
    const store = TestBed.inject(ThemeStore);
    store.toggle();

    expect(store.theme()).toBe('dark');
    expect(store.isDark()).toBe(true);
    expect(store.themeClass()).toBe('dark');

    store.toggle();

    expect(store.isDark()).toBe(false);
    expect(store.themeClass()).toBe('light');
  });

  it('names the theme on the root of the page, so the page behind the shell wears a chosen theme too', () => {
    const store = TestBed.inject(ThemeStore);
    TestBed.tick();

    expect(document.documentElement.classList.contains('light')).toBe(true);

    store.toggle();
    TestBed.tick();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('keeps the theme that was chosen even when the system changes under it', () => {
    const system = stubSystemTheme(false);
    const store = TestBed.inject(ThemeStore);

    store.toggle();
    system.switchTo(false);

    expect(store.isDark()).toBe(true);
  });

  it('remembers the choice for the next launch', () => {
    TestBed.inject(ThemeStore).toggle();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
  });

  it('falls back to the system theme when storage cannot be read at all', () => {
    vi.stubGlobal('localStorage', undefined);
    stubSystemTheme(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
  });
});
