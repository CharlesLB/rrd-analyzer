import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleasesStore } from './releases.store';

const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const browseAs = (userAgent: string): void => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
};

describe('ReleasesStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers the Windows installer until it has looked at the browser, which is what the prerendered page shows', () => {
    const store = TestBed.inject(ReleasesStore);

    expect(store.visitorPlatform()).toBe('windows');
    expect(store.primaryDownload().file?.kind).toBe('windowsInstaller');
  });

  it('turns to the platform of the visitor once it has read the browser', () => {
    browseAs(LINUX_FIREFOX);
    const store = TestBed.inject(ReleasesStore);

    store.detectVisitorPlatform();

    expect(store.visitorPlatform()).toBe('linux');
    expect(store.primaryDownload().file?.kind).toBe('debianPackage');
    expect(store.platforms().find((platform) => platform.isVisitors)?.platform).toBe('linux');
  });

  it('offers nothing to download to a Mac, while still marking its card as the visitor one', () => {
    browseAs(MAC_SAFARI);
    const store = TestBed.inject(ReleasesStore);

    store.detectVisitorPlatform();

    expect(store.primaryDownload().file).toBeNull();
    expect(store.platforms().find((platform) => platform.isVisitors)?.platform).toBe('macos');
  });

  it('builds every link from the version it announces', () => {
    const store = TestBed.inject(ReleasesStore);

    const urls = store.platforms().flatMap((platform) => platform.files.map((file) => file.url));

    expect(urls.every((url) => url.includes(`/v${store.version}/`))).toBe(true);
  });
});
