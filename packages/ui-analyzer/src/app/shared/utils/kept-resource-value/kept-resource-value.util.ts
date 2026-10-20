import { linkedSignal, type Resource, type Signal } from '@angular/core';

const FAILED_STATUS = 'error';

type ResourceReading<TValue> = {
  readonly value: TValue | undefined;
  readonly hasFailed: boolean;
  readonly scope: string;
};

export const keptResourceValue = <TValue>(resource: Resource<TValue | undefined>, whileNothingToShow: TValue, scopeOf: () => string): Signal<TValue> =>
  linkedSignal<ResourceReading<TValue>, TValue>({
    source: () => ({ value: resource.hasValue() ? resource.value() : undefined, hasFailed: resource.status() === FAILED_STATUS, scope: scopeOf() }),
    computation: (reading, previous) => {
      if (reading.value !== undefined) {
        return reading.value;
      }

      const keepsPrevious = !reading.hasFailed && previous !== undefined && previous.source.scope === reading.scope;

      return keepsPrevious ? previous.value : whileNothingToShow;
    },
  });
