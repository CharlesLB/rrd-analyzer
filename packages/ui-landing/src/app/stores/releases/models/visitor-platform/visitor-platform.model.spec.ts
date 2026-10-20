import { describe, expect, it } from 'vitest';
import { platformOfUserAgent } from './visitor-platform.model';

const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const CHROME_OS = 'Mozilla/5.0 (X11; CrOS x86_64 16093.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

describe('platformOfUserAgent', () => {
  it('reads Windows from a Windows browser', () => {
    expect(platformOfUserAgent(WINDOWS_CHROME)).toBe('windows');
  });

  it('reads macOS from a Mac browser and from an iPhone, whose agent says it is like Mac OS X', () => {
    expect(platformOfUserAgent(MAC_SAFARI)).toBe('macos');
    expect(platformOfUserAgent(IPHONE_SAFARI)).toBe('macos');
  });

  it('reads Linux from a desktop Linux browser', () => {
    expect(platformOfUserAgent(LINUX_FIREFOX)).toBe('linux');
  });

  it('does not take an Android phone for a Linux desktop, and falls back to Windows for it', () => {
    expect(platformOfUserAgent(ANDROID_CHROME)).toBe('windows');
  });

  it('falls back to Windows for an agent it does not recognise or an empty one', () => {
    expect(platformOfUserAgent(CHROME_OS)).toBe('windows');
    expect(platformOfUserAgent('')).toBe('windows');
  });
});
