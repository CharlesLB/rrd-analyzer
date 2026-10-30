export type DeferredPromise<TValue> = {
  readonly promise: Promise<TValue>;
  readonly settle: (value: TValue) => void;
  readonly fail: (error: unknown) => void;
};

export const deferredPromise = <TValue>(): DeferredPromise<TValue> => {
  const handles: { settle: (value: TValue) => void; fail: (error: unknown) => void } = { settle: () => undefined, fail: () => undefined };

  const promise = new Promise<TValue>((resolve, reject) => {
    handles.settle = resolve;
    handles.fail = reject;
  });

  return { promise, settle: (value) => handles.settle(value), fail: (error) => handles.fail(error) };
};
