import { Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PLATFORMS } from '../../../../stores/desktop-window/models/desktop-platform/desktop-platform';
import { stubDesktopRuntime } from '../../../../stores/desktop-window/store/desktop-window-store/desktop-window.store.fixture';
import { elementOf, textOf } from '../../../utils/component-fixture/component-fixture.fixture';
import { TitleBarComponent } from './title-bar.component';

@Component({
  imports: [TitleBarComponent],
  template: '<app-title-bar><span class="projected-title">Atlas</span><button class="projected-action" type="button">go</button></app-title-bar>',
})
class TitleBarHostComponent {}

const renderedTitleBar = async (): Promise<ComponentFixture<TitleBarHostComponent>> => {
  const fixture = TestBed.createComponent(TitleBarHostComponent);
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
};

const doubleClick = (element: HTMLElement | null): void => {
  element?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
};

describe('TitleBarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows only what it is given outside the desktop runtime', async () => {
    const fixture = await renderedTitleBar();

    expect(textOf(fixture, '.title-bar-content .projected-title')).toBe('Atlas');
    expect(elementOf(fixture, '.window-controls')).toBeNull();
    expect(elementOf(fixture, '.title-bar-native-controls')).toBeNull();
  });

  it('draws the window controls on Windows and sends each one to the window', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.WINDOWS);
    const fixture = await renderedTitleBar();

    elementOf(fixture, '.window-controls-minimise')?.click();
    elementOf(fixture, '.window-controls-maximise')?.click();
    elementOf(fixture, '.window-controls-close')?.click();

    expect(elementOf(fixture, '.window-controls-linux')).toBeNull();
    expect(runtime.WindowMinimise).toHaveBeenCalledOnce();
    expect(runtime.WindowToggleMaximise).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(runtime.Quit).toHaveBeenCalledOnce());
  });

  it('draws the Linux flavour of the controls on Linux', async () => {
    stubDesktopRuntime(DESKTOP_PLATFORMS.LINUX);
    const fixture = await renderedTitleBar();

    expect(elementOf(fixture, '.window-controls-linux')).not.toBeNull();
  });

  it('draws no controls on macOS and leaves room for the traffic lights instead', async () => {
    stubDesktopRuntime(DESKTOP_PLATFORMS.MAC_OS);
    const fixture = await renderedTitleBar();

    expect(elementOf(fixture, '.window-controls')).toBeNull();
    expect(elementOf(fixture, '.title-bar-native-controls')).not.toBeNull();
  });

  it('toggles maximise on a double click on the bar, but not on a button inside it', async () => {
    const runtime = stubDesktopRuntime(DESKTOP_PLATFORMS.WINDOWS);
    const fixture = await renderedTitleBar();

    doubleClick(elementOf(fixture, '.projected-action'));

    expect(runtime.WindowToggleMaximise).not.toHaveBeenCalled();

    doubleClick(elementOf(fixture, '.title-bar'));

    expect(runtime.WindowToggleMaximise).toHaveBeenCalledOnce();
  });
});
