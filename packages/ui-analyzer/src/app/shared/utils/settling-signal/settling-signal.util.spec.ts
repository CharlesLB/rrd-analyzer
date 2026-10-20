import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettlingSignal } from './settling-signal.util';

const DELAY = 150;

const settling = () => runInInjectionContext(TestBed.inject(Injector), () => useSettlingSignal('first', DELAY));

describe('useSettlingSignal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useSettlingSignal set shows the value at once', () => {
    const value = settling();

    value.set('second');

    expect(value.value()).toBe('second');
  });

  it('useSettlingSignal settle shows only the last of a quick run of values, once they stop for the delay', () => {
    const value = settling();

    value.settle('second');
    vi.advanceTimersByTime(DELAY - 1);
    value.settle('third');
    vi.advanceTimersByTime(DELAY - 1);

    expect(value.value()).toBe('first');

    vi.advanceTimersByTime(1);

    expect(value.value()).toBe('third');
  });

  it('useSettlingSignal set drops a value still settling, so it never lands after the one set', () => {
    const value = settling();

    value.settle('second');
    value.set('third');
    vi.advanceTimersByTime(DELAY);

    expect(value.value()).toBe('third');
  });

  it('useSettlingSignal of a destroyed injector never lands a value still settling', () => {
    const value = settling();

    value.settle('second');
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(DELAY);

    expect(value.value()).toBe('first');
  });
});
