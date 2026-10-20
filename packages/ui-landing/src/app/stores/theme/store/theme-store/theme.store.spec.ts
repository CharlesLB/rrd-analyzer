import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeStore } from './theme.store';
import { inMemoryStorage, stubSystemTheme } from './theme.store.fixture';

const SERVER_PLATFORM = 'server';

describe('ThemeStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', inMemoryStorage());
    stubSystemTheme(false);
    document.documentElement.classList.remove('light', 'dark');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wears the theme the system is set to on a first visit', () => {
    stubSystemTheme(true);

    expect(TestBed.inject(ThemeStore).theme()).toBe('dark');
  });

  it('follows the system while nobody has chosen a theme', () => {
    const system = stubSystemTheme(false);
    const store = TestBed.inject(ThemeStore);

    system.switchTo(true);

    expect(store.isDark()).toBe(true);
  });

  it('toggles to dark and back', () => {
    const store = TestBed.inject(ThemeStore);
    store.toggle();

    expect(store.theme()).toBe('dark');
    expect(store.isDark()).toBe(true);

    store.toggle();

    expect(store.isDark()).toBe(false);
  });

  it('names the theme on the root of the page, where the color tokens switch with it', () => {
    const store = TestBed.inject(ThemeStore);
    TestBed.tick();

    expect(document.documentElement.classList.contains('light')).toBe(true);

    store.toggle();
    TestBed.tick();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('leaves the root of the page alone while it is prerendered, so the visitor system theme still applies on load', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: SERVER_PLATFORM }] });

    TestBed.inject(ThemeStore);
    TestBed.tick();

    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('keeps the theme that was chosen even when the system changes under it', () => {
    const system = stubSystemTheme(false);
    const store = TestBed.inject(ThemeStore);

    store.toggle();
    system.switchTo(false);

    expect(store.isDark()).toBe(true);
  });

  it('remembers the choice for the next visit', () => {
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
