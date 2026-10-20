import { resource, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { keptResourceValue } from './kept-resource-value.util';

type Loaded = readonly string[];

type Request = {
  readonly scope: string;
  readonly window: number;
};

type PendingLoad = {
  readonly resolve: (value: Loaded) => void;
  readonly reject: (reason: Error) => void;
};

const NOTHING: Loaded = [];

const keptLoads = () => {
  const request = signal<Request>({ scope: 'a1', window: 1 });
  const pending: PendingLoad[] = [];

  const loads = TestBed.runInInjectionContext(() =>
    resource({
      params: () => request(),
      loader: async () => await new Promise<Loaded>((resolve, reject) => pending.push({ resolve, reject })),
    }),
  );

  const kept = keptResourceValue(loads, NOTHING, () => request().scope);

  const settleWith = async (outcome: (load: PendingLoad) => void): Promise<void> => {
    await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
    outcome(pending.splice(0)[0] as PendingLoad);
    await vi.waitFor(() => expect(loads.isLoading()).toBe(false));
  };

  return { request, kept, settleWith };
};

describe('keptResourceValue', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('keptResourceValue before anything has loaded shows nothing', () => {
    const { kept } = keptLoads();

    expect(kept()).toBe(NOTHING);
  });

  it('keptResourceValue keeps the last value on screen while the next window of the same analysis loads', async () => {
    const { request, kept, settleWith } = keptLoads();
    await settleWith((load) => load.resolve(['first']));
    expect(kept()).toEqual(['first']);

    request.set({ scope: 'a1', window: 2 });
    TestBed.tick();

    expect(kept()).toEqual(['first']);

    await settleWith((load) => load.resolve(['second']));

    expect(kept()).toEqual(['second']);
  });

  it('keptResourceValue for a window that failed to load shows nothing rather than the window before it', async () => {
    const { request, kept, settleWith } = keptLoads();
    await settleWith((load) => load.resolve(['first']));
    expect(kept()).toEqual(['first']);

    request.set({ scope: 'a1', window: 2 });
    await settleWith((load) => load.reject(new Error('unreadable')));

    expect(kept()).toBe(NOTHING);
  });

  it('keptResourceValue while another analysis loads shows nothing rather than the analysis before it', async () => {
    const { request, kept, settleWith } = keptLoads();
    await settleWith((load) => load.resolve(['first']));
    expect(kept()).toEqual(['first']);

    request.set({ scope: 'a2', window: 1 });
    TestBed.tick();

    expect(kept()).toBe(NOTHING);
  });
});
