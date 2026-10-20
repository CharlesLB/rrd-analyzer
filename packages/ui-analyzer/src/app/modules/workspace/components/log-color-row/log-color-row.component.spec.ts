import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_TYPE_COLORS, PALETTE_COLORS } from '../../../../shared/constants/colors';
import { countOf, cssColorOf, elementOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogColorRowComponent } from './log-color-row.component';

const renderRow = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogColorRowComponent, { name: 'error', count: '21', color: LOG_TYPE_COLORS.error, isOpen: false, canReset: false, ...inputs });

describe('LogColorRowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the type, how many entries it has and its colour on a swatch named for a screen reader', () => {
    const fixture = renderRow();
    const swatch = elementOf(fixture, '.log-color-row-swatch');

    expect(textOf(fixture, '.log-color-row-name')).toBe('error');
    expect(textOf(fixture, '.log-color-row-count')).toBe('21');
    expect(swatch?.style.background).toBe(cssColorOf(LOG_TYPE_COLORS.error));
    expect(swatch?.getAttribute('aria-label')).toBe('change the color of error');
    expect(elementOf(fixture, '.log-color-row-palette')).toBeNull();
    expect(elementOf(fixture, '.log-color-row-reset')).toBeNull();
  });

  it('when open, offers the twelve curated colours with the current one ringed, and reports the one picked', () => {
    const fixture = renderRow({ isOpen: true });
    const chosen = vi.fn();
    fixture.componentInstance.colorChosen.subscribe(chosen);
    const choices = elementsOf(fixture, '.color-palette-choice');

    expect(choices).toHaveLength(12);
    expect(countOf(fixture, '.color-palette-choice-current')).toBe(1);
    expect(choices[0]?.classList.contains('color-palette-choice-current')).toBe(true);

    choices[7]?.click();

    expect(chosen).toHaveBeenCalledWith(PALETTE_COLORS[7]);
  });

  it('when open, mixes any colour in its own picker from Custom…, and reports it once applied', () => {
    const fixture = renderRow({ isOpen: true });
    const chosen = vi.fn();
    fixture.componentInstance.colorChosen.subscribe(chosen);

    elementOf(fixture, '.color-palette-custom')?.click();
    fixture.detectChanges();
    const hex = elementOf(fixture, '.color-mixer-hex-input');

    if (hex instanceof HTMLInputElement) {
      hex.value = '#123456';
      hex.dispatchEvent(new Event('change'));
    }

    fixture.detectChanges();
    elementOf(fixture, '.color-mixer-apply')?.click();

    expect(chosen).toHaveBeenCalledWith('#123456');
  });

  it('for a recoloured type, offers a reset, and asks to open its palette when the swatch is pressed', () => {
    const fixture = renderRow({ color: '#123456', canReset: true });
    const reset = vi.fn();
    const toggled = vi.fn();
    fixture.componentInstance.resetRequested.subscribe(reset);
    fixture.componentInstance.toggled.subscribe(toggled);

    elementOf(fixture, '.log-color-row-reset')?.click();
    elementOf(fixture, '.log-color-row-swatch')?.click();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(toggled).toHaveBeenCalledTimes(1);
  });
});
