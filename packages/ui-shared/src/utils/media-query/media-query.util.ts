import { DestroyRef, inject, type Signal, signal } from '@angular/core';

const CHANGE_EVENT = 'change';

export const useMediaQuery = (query: string): Signal<boolean> => {
  const mediaList = globalThis.matchMedia?.(query);
  const matches = signal(mediaList?.matches ?? false);

  if (mediaList === undefined) {
    return matches.asReadonly();
  }

  const followChange = (event: MediaQueryListEvent): void => matches.set(event.matches);

  mediaList.addEventListener(CHANGE_EVENT, followChange);
  inject(DestroyRef).onDestroy(() => mediaList.removeEventListener(CHANGE_EVENT, followChange));

  return matches.asReadonly();
};
