import { DestroyRef, inject, type Signal, signal } from '@angular/core';

type SettlingSignal<TValue> = {
  readonly value: Signal<TValue>;
  readonly set: (value: TValue) => void;
  readonly settle: (value: TValue) => void;
};

export const useSettlingSignal = <TValue>(initial: TValue, delayMilliseconds: number): SettlingSignal<TValue> => {
  const state = signal(initial);
  const pending: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined };

  const cancelPending = (): void => clearTimeout(pending.timer);

  inject(DestroyRef).onDestroy(cancelPending);

  return {
    value: state.asReadonly(),
    set: (value) => {
      cancelPending();
      state.set(value);
    },
    settle: (value) => {
      cancelPending();
      pending.timer = setTimeout(() => state.set(value), delayMilliseconds);
    },
  };
};
