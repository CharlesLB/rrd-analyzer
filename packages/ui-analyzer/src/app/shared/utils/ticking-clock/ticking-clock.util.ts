import { DestroyRef, inject, type Signal, signal } from '@angular/core';

export const useTickingClock = (intervalMilliseconds: number): Signal<number> => {
  const now = signal(Date.now());
  const ticking = setInterval(() => now.set(Date.now()), intervalMilliseconds);

  inject(DestroyRef).onDestroy(() => clearInterval(ticking));

  return now.asReadonly();
};
