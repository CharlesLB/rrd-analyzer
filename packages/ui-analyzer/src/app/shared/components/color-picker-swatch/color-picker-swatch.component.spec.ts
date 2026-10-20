import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs } from '../../utils/component-fixture/component-fixture.fixture';
import { ColorPickerSwatchComponent } from './color-picker-swatch.component';

describe('ColorPickerSwatchComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the color on a swatch named for what it changes, marked while its picker is open', () => {
    const fixture = renderWithInputs(ColorPickerSwatchComponent, { color: '#005581', label: 'change the color of cpu', isOpen: true });

    expect(elementOf(fixture, '.color-picker-swatch')?.getAttribute('aria-label')).toBe('change the color of cpu');
    expect(elementOf(fixture, '.color-picker-swatch')?.getAttribute('aria-expanded')).toBe('true');
    expect(elementOf(fixture, '.color-swatch')?.style.background).toBe('rgb(0, 85, 129)');
  });

  it('asks for its picker under the swatch pressed', () => {
    const fixture = renderWithInputs(ColorPickerSwatchComponent, { color: '#005581', label: 'change the color of cpu' });
    const requested = vi.fn();
    fixture.componentInstance.pickRequested.subscribe(requested);

    elementOf(fixture, '.color-picker-swatch')?.click();

    expect(requested).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number), bottom: expect.any(Number) }));
  });
});
