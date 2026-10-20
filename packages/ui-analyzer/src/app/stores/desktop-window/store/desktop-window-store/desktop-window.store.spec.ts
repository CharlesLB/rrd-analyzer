import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisDtoFixture, analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { LibraryStore } from '../../../library/store/library-store/library.store';
import { DESKTOP_PLATFORMS } from '../../models/desktop-platform/desktop-platform';
import { DesktopWindowStore } from './desktop-window.store';
import { stubDesktopRuntime } from './desktop-window.store.fixture';

const loadedStore = async (): Promise<DesktopWindowStore> => {
  const store = TestBed.inject(DesktopWindowStore);

  await vi.waitFor(() => {
    expect(store.windowControlsPlatform() ?? store.reservesNativeControls()).toBeTruthy();
  });

  return store;
};

describe('DesktopWindowStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('draws no window controls and reserves no room outside the desktop runtime', async () => {
    const store = TestBed.inject(DesktopWindowStore);
    await Promise.resolve();

    expect(store.windowControlsPlatform()).toBeUndefined();
    expect(store.reservesNativeControls()).toBe(false);
  });

  it.each([DESKTOP_PLATFORMS.WINDOWS, DESKTOP_PLATFORMS.LINUX])('draws the window controls itself on %s', async (platform) => {
    stubDesktopRuntime(platform);

    const store = await loadedStore();

    expect(store.windowControlsPlatform()).toBe(platform);
    expect(store.reservesNativeControls()).toBe(false);
  });

  it('leaves the controls to the native traffic lights on macOS and reserves their room', async () => {
    stubDesktopRuntime(DESKTOP_PLATFORMS.MAC_OS);

    const store = await loadedStore();

    expect(store.windowControlsPlatform()).toBeUndefined();
    expect(store.reservesNativeControls()).toBe(true);
  });

  it('draws nothing, and fails nothing, when the runtime cannot say which platform it runs on', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    runtime.Environment.mockRejectedValueOnce(new Error('runtime gone'));

    const store = TestBed.inject(DesktopWindowStore);
    await vi.waitFor(() => {
      expect(runtime.Environment).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.windowControlsPlatform()).toBeUndefined();
  });

  it('keeps the window as it was known when the runtime cannot say whether it is maximised', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    runtime.WindowIsMaximised.mockRejectedValue(new Error('runtime gone'));

    const store = await loadedStore();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.isMaximised()).toBe(false);
  });

  it('draws nothing for a platform the runtime names but the app does not know', async () => {
    const runtime = stubDesktopRuntime('freebsd');
    const store = TestBed.inject(DesktopWindowStore);
    await vi.waitFor(() => {
      expect(runtime.Environment).toHaveBeenCalled();
    });

    expect(store.windowControlsPlatform()).toBeUndefined();
    expect(store.reservesNativeControls()).toBe(false);
  });

  it('hands minimise, maximise and close straight to the runtime', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.WINDOWS);
    const store = await loadedStore();

    store.minimise();
    store.toggleMaximise();
    await store.close();

    expect(runtime.WindowMinimise).toHaveBeenCalledOnce();
    expect(runtime.WindowToggleMaximise).toHaveBeenCalledOnce();
    expect(runtime.Quit).toHaveBeenCalledOnce();
  });

  it('closes only once an analysis deleted a moment ago, its Undo still on offer, is deleted for good', async () => {
    const answer: { release: () => void } = { release: () => undefined };

    const gateway = analyzerGatewayStub({
      listAnalyses: vi.fn().mockResolvedValue([analysisDtoFixture()]),
      deleteAnalysis: vi.fn(
        async () =>
          await new Promise<void>((resolve) => {
            answer.release = resolve;
          }),
      ),
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    const store = await loadedStore();
    const library = TestBed.inject(LibraryStore);
    await library.refresh();
    library.remove(analysisDtoFixture().id);

    const closing = store.close();
    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith(analysisDtoFixture().id));

    expect(runtime.Quit).not.toHaveBeenCalled();

    answer.release();
    await closing;

    expect(runtime.Quit).toHaveBeenCalledOnce();
  });

  it('closes all the same when that deletion never answers, rather than keeping the window open for ever', async () => {
    const gateway = analyzerGatewayStub({
      listAnalyses: vi.fn().mockResolvedValue([analysisDtoFixture()]),
      deleteAnalysis: vi.fn(async () => await new Promise<void>(() => undefined)),
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    const store = await loadedStore();
    const library = TestBed.inject(LibraryStore);
    await library.refresh();
    library.remove(analysisDtoFixture().id);
    vi.useFakeTimers();

    const closing = store.close();
    await vi.advanceTimersByTimeAsync(3000);
    await closing;

    expect(runtime.Quit).toHaveBeenCalledOnce();
  });

  it('asks whether the window is maximised once per burst of resizes, after the burst settles', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    const store = await loadedStore();
    vi.useFakeTimers();
    runtime.WindowIsMaximised.mockResolvedValue(true);

    globalThis.dispatchEvent(new Event('resize'));
    globalThis.dispatchEvent(new Event('resize'));
    globalThis.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(200);

    expect(store.isMaximised()).toBe(true);
    expect(runtime.WindowIsMaximised).toHaveBeenCalledTimes(2);
  });
});
