import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE_COLORS } from '../../constants/colors';
import { countOf, elementOf, elementsOf, renderWithInputs } from '../../utils/component-fixture/component-fixture.fixture';
import { ColorPaletteComponent } from './color-palette.component';

const renderPalette = (color: string) => {
  const fixture = renderWithInputs(ColorPaletteComponent, { color });
  const chosen = vi.fn();

  fixture.componentInstance.colorChosen.subscribe(chosen);

  return { fixture, chosen };
};

const pressCustom = (fixture: ReturnType<typeof renderPalette>['fixture']): void => {
  elementOf(fixture, '.color-palette-custom')?.click();
  fixture.detectChanges();
};

describe('ColorPaletteComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('offers every color of the palette and marks the current one, whatever the case it is written in', () => {
    const { fixture } = renderPalette('#1d80ac');

    const pressed = elementsOf(fixture, '.color-palette-choice').filter((choice) => choice.getAttribute('aria-pressed') === 'true');

    expect(countOf(fixture, '.color-palette-choice')).toBe(PALETTE_COLORS.length);
    expect(pressed.map((choice) => choice.getAttribute('aria-label'))).toEqual(['#1D80AC']);
    expect(elementOf(fixture, '.color-palette-custom-current')).toBeNull();
  });

  it('chooses the color of the swatch that is pressed', () => {
    const { fixture, chosen } = renderPalette('#1d80ac');

    elementsOf(fixture, '.color-palette-choice')[0]?.click();

    expect(chosen).toHaveBeenCalledWith(PALETTE_COLORS[0]);
  });

  it('marks Custom as current, with a dot of the color, for a color outside the palette', () => {
    const { fixture } = renderPalette('#123456');

    expect(elementOf(fixture, '.color-palette-custom-current')).not.toBeNull();
    expect(elementOf(fixture, '.color-palette-custom-dot')?.style.background).toBe('rgb(18, 52, 86)');
  });

  it('opens the mixer on Custom and closes it when Custom is pressed again', () => {
    const { fixture } = renderPalette('#1d80ac');

    pressCustom(fixture);

    expect(elementOf(fixture, 'app-color-mixer')).not.toBeNull();
    expect(elementOf(fixture, '.color-palette-custom')?.getAttribute('aria-expanded')).toBe('true');

    pressCustom(fixture);

    expect(elementOf(fixture, 'app-color-mixer')).toBeNull();
  });

  it('chooses the color mixed once the mixer applies it, and closes the mixer', () => {
    const { fixture, chosen } = renderPalette('#1d80ac');
    pressCustom(fixture);

    elementOf(fixture, '.color-mixer-apply')?.click();
    fixture.detectChanges();

    expect(chosen).toHaveBeenCalledWith('#1d80ac');
    expect(elementOf(fixture, 'app-color-mixer')).toBeNull();
  });

  it('closes the mixer without choosing anything once the mixer is cancelled', () => {
    const { fixture, chosen } = renderPalette('#1d80ac');
    pressCustom(fixture);

    elementOf(fixture, '.color-mixer-cancel')?.click();
    fixture.detectChanges();

    expect(chosen).not.toHaveBeenCalled();
    expect(elementOf(fixture, 'app-color-mixer')).toBeNull();
  });
});
