import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('ColorMixerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
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
});
