import type { ValueOf } from '../../../../shared/types/value-of';

export const DESKTOP_PLATFORMS = {
  WINDOWS: 'windows',
  LINUX: 'linux',
  MAC_OS: 'darwin',
} as const;

export type DesktopPlatform = ValueOf<typeof DESKTOP_PLATFORMS>;
