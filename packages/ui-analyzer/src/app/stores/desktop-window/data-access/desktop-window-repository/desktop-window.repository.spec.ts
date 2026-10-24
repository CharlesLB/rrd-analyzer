import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PLATFORMS } from '../../models/desktop-platform/desktop-platform';
import { stubDesktopRuntime } from '../../store/desktop-window-store/desktop-window.store.fixture';
import { DesktopWindowRepository } from './desktop-window.repository';

describe('DesktopWindowRepository', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isMaximised outside the desktop runtime reports a window that is not maximised', async () => {
    const repository = TestBed.inject(DesktopWindowRepository);

    const isMaximised = await repository.isMaximised();

    expect(isMaximised).toBe(false);
  });

  it('isMaximised inside the desktop runtime reports what the runtime answers', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.WINDOWS);
    runtime.WindowIsMaximised.mockResolvedValue(true);
    const repository = TestBed.inject(DesktopWindowRepository);

    const isMaximised = await repository.isMaximised();

    expect(isMaximised).toBe(true);
  });

  it('platform outside the desktop runtime is unknown, and minimise, maximise and close do nothing', async () => {
    const repository = TestBed.inject(DesktopWindowRepository);

    const platform = await repository.platform();

    expect(platform).toBeUndefined();
    expect(() => {
      repository.minimise();
      repository.toggleMaximise();
      repository.close();
    }).not.toThrow();
  });
});
