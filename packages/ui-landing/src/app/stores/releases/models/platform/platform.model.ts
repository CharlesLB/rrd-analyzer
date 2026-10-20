import type { ValueOf } from '../../../../shared/types/value-of';

export const PLATFORMS = {
  WINDOWS: 'windows',
  LINUX: 'linux',
  MACOS: 'macos',
} as const;

export type Platform = ValueOf<typeof PLATFORMS>;

export const DEFAULT_PLATFORM: Platform = PLATFORMS.WINDOWS;
