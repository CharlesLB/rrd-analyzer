import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs } from '../../utils/component-fixture/component-fixture.fixture';
import { ColorMixerComponent } from './color-mixer.component';

const renderMixer = () => renderWithInputs(ColorMixerComponent, { color: '#ff0000' });

const pressButton = (fixture: ReturnType<typeof renderMixer>, selector: string): void => {
  elementOf(fixture, selector)?.click();
};

const hexInputOf = (fixture: ReturnType<typeof renderMixer>): HTMLInputElement | null => {
  const input = elementOf(fixture, '.color-mixer-hex-input');

  return input instanceof HTMLInputElement ? input : null;
};

type SliderStub = {
  readonly area: HTMLElement;
  readonly setPointerCapture: ReturnType<typeof vi.fn>;
};

const AREA_BOUNDS = { left: 10, top: 20, width: 200, height: 100 };

const sliderOf = (fixture: ReturnType<typeof renderMixer>, selector: string, bounds: Partial<DOMRect> = AREA_BOUNDS): SliderStub => {
  const area = elementOf(fixture, selector);

  if (area === null) {
    throw new Error(`the mixer has no ${selector}`);
  }

  const setPointerCapture = vi.fn();
  const holdsPointer = { isHeld: false };

  vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(bounds as DOMRect);
  Object.assign(area, {
    setPointerCapture: (pointerId: number) => {
      holdsPointer.isHeld = true;
      setPointerCapture(pointerId);
    },
    hasPointerCapture: () => holdsPointer.isHeld,
  });

  return { area, setPointerCapture };
};

const pointAt = (fixture: ReturnType<typeof renderMixer>, area: HTMLElement, type: string, clientX: number, clientY: number): void => {
  area.dispatchEvent(new PointerEvent(type, { clientX, clientY, pointerId: 7, bubbles: true }));
  fixture.detectChanges();
};

const shadeThumbOf = (fixture: ReturnType<typeof renderMixer>): readonly string[] => {
  const thumb = elementOf(fixture, '.color-mixer-shade-thumb');

  return [thumb?.style.left ?? '', thumb?.style.top ?? ''];
};

describe('ColorMixerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts on the color it was given, its hue under the hue thumb and its hex in the field', () => {
    const fixture = renderMixer();

    expect(hexInputOf(fixture)?.value).toBe('#ff0000');
    expect(elementOf(fixture, '.color-mixer-hue')?.getAttribute('aria-valuenow')).toBe('0');
    expect(elementOf(fixture, '.color-mixer-shade-thumb')?.style.left).toBe('100%');
  });

  it('moves through the hues and the shades from the keyboard', () => {
    const fixture = renderMixer();

    elementOf(fixture, '.color-mixer-hue')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.color-mixer-hue')?.getAttribute('aria-valuenow')).toBe('5');

    elementOf(fixture, '.color-mixer-shade')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    fixture.detectChanges();

    expect(hexInputOf(fixture)?.value).toBe('#f21400');
  });

  it('takes a typed hex, ignores one that is not a color, and hands over the color mixed on Apply', () => {
    const fixture = renderMixer();
    const chosen = vi.fn();
    fixture.componentInstance.colorChosen.subscribe(chosen);
    const input = hexInputOf(fixture);

    if (input !== null) {
      input.value = 'zz';
      input.dispatchEvent(new Event('change'));
      input.value = '1D80AC';
      input.dispatchEvent(new Event('change'));
    }

    fixture.detectChanges();
    pressButton(fixture, '.color-mixer-apply');

    expect(chosen).toHaveBeenCalledWith('#1d80ac');
  });

  it('asks to be closed on Cancel, choosing nothing', () => {
    const fixture = renderMixer();
    const chosen = vi.fn();
    const cancelled = vi.fn();
    fixture.componentInstance.colorChosen.subscribe(chosen);
    fixture.componentInstance.cancelled.subscribe(cancelled);

    pressButton(fixture, '.color-mixer-cancel');

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(chosen).not.toHaveBeenCalled();
  });

  it('picks the shade under the pointer where the shade area is grabbed, and keeps the pointer to itself while it is dragged', () => {
    const fixture = renderMixer();
    const { area, setPointerCapture } = sliderOf(fixture, '.color-mixer-shade');

    pointAt(fixture, area, 'pointerdown', 110, 45);

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(shadeThumbOf(fixture)).toEqual(['50%', '25%']);

    pointAt(fixture, area, 'pointermove', 260, 0);

    expect(shadeThumbOf(fixture)).toEqual(['100%', '0%']);
  });

  it('ignores the pointer moving over the shade area while nothing holds it', () => {
    const fixture = renderMixer();
    const { area } = sliderOf(fixture, '.color-mixer-shade');

    pointAt(fixture, area, 'pointermove', 110, 45);

    expect(shadeThumbOf(fixture)).toEqual(['100%', '0%']);
  });

  it.each([
    { dimension: 'height', bounds: { ...AREA_BOUNDS, height: 0 } },
    { dimension: 'width', bounds: { ...AREA_BOUNDS, width: 0 } },
  ])('takes the corner of the shade area for a pointer on an area that has no $dimension yet', ({ bounds }) => {
    const fixture = renderMixer();
    const { area } = sliderOf(fixture, '.color-mixer-shade', bounds);

    pointAt(fixture, area, 'pointerdown', 110, 45);

    expect(shadeThumbOf(fixture)).toEqual(['0%', '0%']);
  });

  it('picks the hue under the pointer on the hue track, stopping one degree short of going round', () => {
    const fixture = renderMixer();
    const { area, setPointerCapture } = sliderOf(fixture, '.color-mixer-hue');

    pointAt(fixture, area, 'pointerdown', 110, 30);

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(area.getAttribute('aria-valuenow')).toBe('180');

    pointAt(fixture, area, 'pointermove', 400, 30);

    expect(area.getAttribute('aria-valuenow')).toBe('359');
  });

  it('ignores the pointer moving over the hue track while nothing holds it', () => {
    const fixture = renderMixer();
    const { area } = sliderOf(fixture, '.color-mixer-hue');

    pointAt(fixture, area, 'pointermove', 110, 30);

    expect(area.getAttribute('aria-valuenow')).toBe('0');
  });

  it('leaves the keys that do not move a slider to the page', () => {
    const fixture = renderMixer();
    const onShade = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    const onHue = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

    elementOf(fixture, '.color-mixer-shade')?.dispatchEvent(onShade);
    elementOf(fixture, '.color-mixer-hue')?.dispatchEvent(onHue);
    fixture.detectChanges();

    expect(onShade.defaultPrevented).toBe(false);
    expect(onHue.defaultPrevented).toBe(false);
    expect(hexInputOf(fixture)?.value).toBe('#ff0000');
  });
});
