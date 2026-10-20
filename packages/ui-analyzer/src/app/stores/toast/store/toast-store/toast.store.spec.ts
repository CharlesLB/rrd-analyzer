import { effect, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastStore } from './toast.store';

describe('ToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows nothing until something is reported', () => {
    expect(TestBed.inject(ToastStore).message()).toBeNull();
  });

  it('shown from an effect, does not make that effect depend on the toast, which would run it again for ever', () => {
    const store = TestBed.inject(ToastStore);
    const failures = signal(0);
    const runs = { count: 0 };

    TestBed.runInInjectionContext(() =>
      effect(() => {
        runs.count += 1;

        if (failures() > 0) {
          store.show('Could not read the series');
        }
      }),
    );
    TestBed.tick();
    failures.set(1);
    TestBed.tick();
    store.dismiss();
    TestBed.tick();

    expect(runs.count).toBe(2);
  });

  it('dismisses itself after 2 seconds', () => {
    const store = TestBed.inject(ToastStore);
    store.show('CSV exported');

    expect(store.message()).toBe('CSV exported');

    vi.advanceTimersByTime(1999);

    expect(store.message()).toBe('CSV exported');

    vi.advanceTimersByTime(1);

    expect(store.message()).toBeNull();
  });

  it('restarts the countdown when a second message arrives', () => {
    const store = TestBed.inject(ToastStore);
    store.show('first');
    vi.advanceTimersByTime(1500);
    store.show('second');
    vi.advanceTimersByTime(1500);

    expect(store.message()).toBe('second');

    vi.advanceTimersByTime(500);

    expect(store.message()).toBeNull();
  });

  it('show with an action offers it for 6 seconds, long enough to reach it', () => {
    const store = TestBed.inject(ToastStore);
    store.show('charts merged', { label: 'Undo', run: vi.fn() });

    expect(store.actionLabel()).toBe('Undo');

    vi.advanceTimersByTime(5999);

    expect(store.message()).toBe('charts merged');

    vi.advanceTimersByTime(1);

    expect(store.message()).toBeNull();
    expect(store.actionLabel()).toBeNull();
  });

  it('showFailure keeps a failure on show for 6 seconds, long enough to read it', () => {
    const store = TestBed.inject(ToastStore);
    store.showFailure('the analysis could not be created');

    vi.advanceTimersByTime(5999);

    expect(store.message()).toBe('the analysis could not be created');

    vi.advanceTimersByTime(1);

    expect(store.message()).toBeNull();
  });

  it('hold keeps the toast on show for as long as it is held, and release starts its time over', () => {
    const store = TestBed.inject(ToastStore);
    store.show('CSV exported');

    vi.advanceTimersByTime(1500);
    store.hold();
    vi.advanceTimersByTime(60_000);

    expect(store.message()).toBe('CSV exported');

    store.release();
    vi.advanceTimersByTime(1999);

    expect(store.message()).toBe('CSV exported');

    vi.advanceTimersByTime(1);

    expect(store.message()).toBeNull();
  });

  it('release with no toast on show starts nothing', () => {
    const store = TestBed.inject(ToastStore);

    store.release();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('a toast that leaves without its action, by time, by dismissal or by another toast, does what it said it would otherwise', () => {
    const store = TestBed.inject(ToastStore);
    const otherwise = vi.fn();
    const action = { label: 'Undo', run: vi.fn(), otherwise };

    store.show('analysis deleted', action);
    vi.advanceTimersByTime(6000);
    store.show('analysis deleted', action);
    store.dismiss();
    store.show('analysis deleted', action);
    store.show('CSV exported');

    expect(otherwise).toHaveBeenCalledTimes(3);
    expect(action.run).not.toHaveBeenCalled();
  });

  it('runAction runs the action alone, never what the toast would have done otherwise', () => {
    const store = TestBed.inject(ToastStore);
    const otherwise = vi.fn();
    store.show('analysis deleted', { label: 'Undo', run: vi.fn(), otherwise });

    store.runAction();
    vi.advanceTimersByTime(60_000);

    expect(otherwise).not.toHaveBeenCalled();
  });

  it('runAction takes the toast away before running the action, so a toast the action shows is the one left', () => {
    const store = TestBed.inject(ToastStore);
    const run = vi.fn(() => store.show('merge undone'));
    store.show('charts merged', { label: 'Undo', run });

    store.runAction();

    expect(run).toHaveBeenCalledTimes(1);
    expect(store.message()).toBe('merge undone');
    expect(store.actionLabel()).toBeNull();
  });

  it('a message without an action takes away the action of the one before', () => {
    const store = TestBed.inject(ToastStore);
    store.show('charts merged', { label: 'Undo', run: vi.fn() });

    store.show('limit of 5 charts on the canvas');

    expect(store.actionLabel()).toBeNull();
  });

  it('dismiss takes the toast and its action away without running the action', () => {
    const store = TestBed.inject(ToastStore);
    const run = vi.fn();
    store.show('charts merged', { label: 'Undo', run });

    store.dismiss();

    expect(store.message()).toBeNull();
    expect(store.actionLabel()).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
