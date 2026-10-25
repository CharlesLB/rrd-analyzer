import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaQuery } from './media-query.util';

type ChangeListener = (event: MediaQueryListEvent) => void;

const fakeMediaList = (initiallyMatches: boolean) => {
  const listeners: ChangeListener[] = [];

  return {
    matches: initiallyMatches,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => listeners.push(listener)),
    removeEventListener: vi.fn(),
    emit: (matches: boolean) => {
      listeners.forEach((listener) => {
        listener({ matches } as MediaQueryListEvent);
      });
    },
  };
};

describe('useMediaQuery', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts from whether the query matches and follows every later change', () => {
    const mediaList = fakeMediaList(false);
    vi.stubGlobal('matchMedia', () => mediaList);

    const matches = runInInjectionContext(TestBed.inject(Injector), () => useMediaQuery('(max-width: 759px)'));

    expect(matches()).toBe(false);

    mediaList.emit(true);

    expect(matches()).toBe(true);
  });

  it('reads as not matching where the host has no media queries at all', () => {
    vi.stubGlobal('matchMedia', undefined);

    const matches = runInInjectionContext(TestBed.inject(Injector), () => useMediaQuery('(max-width: 759px)'));

    expect(matches()).toBe(false);
  });
});
