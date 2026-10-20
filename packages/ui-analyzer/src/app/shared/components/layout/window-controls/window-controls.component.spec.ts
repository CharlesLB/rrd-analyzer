import { TestBed } from '@angular/core/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_PLATFORMS } from '../../../../stores/desktop-window/models/desktop-platform/desktop-platform';
import { countOf, elementOf, renderWithInputs } from '../../../utils/component-fixture/component-fixture.fixture';
import { WindowControlsComponent } from './window-controls.component';

const WINDOW_CONTROLS_TEXTS = messagesFor().windowControls;

describe('WindowControlsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('offers minimise, maximise and close, in the order Windows puts them', () => {
    const fixture = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.WINDOWS, isMaximised: false });

    expect(countOf(fixture, '.window-controls-button')).toBe(3);
    expect(elementOf(fixture, '.window-controls-button:nth-child(1)')?.title).toBe(WINDOW_CONTROLS_TEXTS.minimise);
    expect(elementOf(fixture, '.window-controls-button:nth-child(2)')?.title).toBe(WINDOW_CONTROLS_TEXTS.maximise);
    expect(elementOf(fixture, '.window-controls-button:nth-child(3)')?.title).toBe(WINDOW_CONTROLS_TEXTS.close);
  });

  it('turns the maximise button into restore while the window is maximised', () => {
    const fixture = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.WINDOWS, isMaximised: true });

    expect(elementOf(fixture, '.window-controls-maximise')?.title).toBe(WINDOW_CONTROLS_TEXTS.restore);
    expect(countOf(fixture, '.window-controls-maximise rect')).toBe(1);
    expect(countOf(fixture, '.window-controls-maximise path')).toBe(1);
  });

  it('reports each button as its own request', () => {
    const fixture = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.WINDOWS, isMaximised: false });
    const minimised = vi.fn();
    const maximised = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.minimiseRequested.subscribe(minimised);
    fixture.componentInstance.maximiseToggled.subscribe(maximised);
    fixture.componentInstance.closeRequested.subscribe(closed);

    elementOf(fixture, '.window-controls-minimise')?.click();
    elementOf(fixture, '.window-controls-maximise')?.click();
    elementOf(fixture, '.window-controls-close')?.click();

    expect(minimised).toHaveBeenCalledOnce();
    expect(maximised).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('keeps a press on a button from the window-level listener that turns a press near the window edge into a resize, and still clicks it', () => {
    const fixture = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.WINDOWS, isMaximised: true });
    const closed = vi.fn();
    const reachedWindow = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);
    globalThis.addEventListener('mousedown', reachedWindow);

    elementOf(fixture, '.window-controls-close')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    elementOf(fixture, '.window-controls-close')?.click();
    globalThis.removeEventListener('mousedown', reachedWindow);

    expect(reachedWindow).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalledOnce();
  });

  it('switches to the round buttons of a Linux header bar only on Linux', () => {
    const windows = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.WINDOWS, isMaximised: false });
    const linux = renderWithInputs(WindowControlsComponent, { platform: DESKTOP_PLATFORMS.LINUX, isMaximised: false });

    expect(elementOf(windows, '.window-controls-linux')).toBeNull();
    expect(elementOf(linux, '.window-controls-linux')).not.toBeNull();
  });
});
