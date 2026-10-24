import { vi } from 'vitest';

export const inMemoryStorage = (): Storage => {
  const entries = new Map<string, string>();

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
    key: () => null,
    length: 0,
  } as Storage;
};

type MediaQueryListener = (event: MediaQueryListEvent) => void;

type StubbedSystemTheme = {
  readonly switchTo: (isDark: boolean) => void;
};

export const stubSystemTheme = (isDark: boolean): StubbedSystemTheme => {
  const listeners = new Set<MediaQueryListener>();
  const system = { isDark };

  vi.stubGlobal(
    'matchMedia',
    (media: string): MediaQueryList =>
      ({
        media,
        matches: system.isDark,
        addEventListener: (_event: string, listener: MediaQueryListener) => listeners.add(listener),
        removeEventListener: (_event: string, listener: MediaQueryListener) => listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );

  return {
    switchTo: (nextIsDark: boolean) => {
      system.isDark = nextIsDark;
      listeners.forEach((listener) => {
        listener({ matches: nextIsDark } as MediaQueryListEvent);
      });
    },
  };
};
