import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTickingClock } from './ticking-clock.util';

const START = new Date(2026, 7, 29, 15, 0).getTime();
const MINUTE = 60_000;

describe('useTickingClock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const startClock = () => {
    const owner = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));

    return { owner, now: runInInjectionContext(owner, () => useTickingClock(MINUTE)) };
  };

  it('useTickingClock reads the present at once and again at every interval', () => {
    const { now } = startClock();

    expect(now()).toBe(START);

    vi.advanceTimersByTime(MINUTE - 1);

    expect(now()).toBe(START);

    vi.advanceTimersByTime(1);

    expect(now()).toBe(START + MINUTE);
  });

  it('useTickingClock stops ticking once its owner is destroyed', () => {
    const { owner, now } = startClock();

    owner.destroy();
    vi.advanceTimersByTime(5 * MINUTE);

    expect(now()).toBe(START);
    expect(vi.getTimerCount()).toBe(0);
  });
});
