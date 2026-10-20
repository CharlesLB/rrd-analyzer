import { DEFAULT_PLATFORM, PLATFORMS, type Platform } from '../platform/platform.model';

type PlatformSignature = {
  readonly platform: Platform;
  readonly isWornBy: (userAgent: string) => boolean;
};

const WINDOWS_MARK = 'windows';
const APPLE_MARKS = ['macintosh', 'mac os', 'iphone', 'ipad'];
const LINUX_MARK = 'linux';
const ANDROID_MARK = 'android';

const PLATFORM_SIGNATURES: readonly PlatformSignature[] = [
  { platform: PLATFORMS.WINDOWS, isWornBy: (userAgent) => userAgent.includes(WINDOWS_MARK) },
  { platform: PLATFORMS.MACOS, isWornBy: (userAgent) => APPLE_MARKS.some((mark) => userAgent.includes(mark)) },
  { platform: PLATFORMS.LINUX, isWornBy: (userAgent) => userAgent.includes(LINUX_MARK) && !userAgent.includes(ANDROID_MARK) },
];

export const platformOfUserAgent = (userAgent: string): Platform => {
  const lowerCaseAgent = userAgent.toLowerCase();

  return PLATFORM_SIGNATURES.find((signature) => signature.isWornBy(lowerCaseAgent))?.platform ?? DEFAULT_PLATFORM;
};
