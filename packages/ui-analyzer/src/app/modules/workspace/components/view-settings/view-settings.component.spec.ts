import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ViewSettingsComponent } from './view-settings.component';

const renderSettings = (thumbnailFill = true, synchronizedCrosshair = true, logLanes = true) =>
  renderWithInputs(ViewSettingsComponent, { thumbnailFill, synchronizedCrosshair, logLanes });

describe('ViewSettingsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('opens a menu from a button named for a screen reader as for the mouse, and closes it from the backdrop', () => {
    const fixture = renderSettings();
    const toggle = elementOf(fixture, '.view-settings-toggle');

    expect(toggle?.getAttribute('aria-label')).toBe('view settings');
    expect(elementOf(fixture, '.view-settings-item')).toBeNull();

    toggle?.click();
    fixture.detectChanges();

    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(elementsOf(fixture, '.view-settings-label').map((label) => label.textContent?.trim())).toEqual([
      'Fill under the library sparklines',
      'Share the crosshair across charts',
      'One lane per log type',
    ]);

    elementOf(fixture, '.anchored-menu-backdrop')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.view-settings-item')).toBeNull();
  });

  it('checks each setting that is on, and asks for the one clicked to be toggled', () => {
    const fixture = renderSettings(false, true, false);
    const fillToggled = vi.fn();
    const crosshairToggled = vi.fn();
    const lanesToggled = vi.fn();
    fixture.componentInstance.logLanesToggled.subscribe(lanesToggled);
    fixture.componentInstance.thumbnailFillToggled.subscribe(fillToggled);
    fixture.componentInstance.synchronizedCrosshairToggled.subscribe(crosshairToggled);
    elementOf(fixture, '.view-settings-toggle')?.click();
    fixture.detectChanges();
    const [fill, crosshair, lanes] = elementsOf(fixture, '.view-settings-item');

    expect(fill?.getAttribute('aria-checked')).toBe('false');
    expect(crosshair?.getAttribute('aria-checked')).toBe('true');
    expect(lanes?.getAttribute('aria-checked')).toBe('false');
    expect(textOf(fixture, '.view-settings-item:nth-of-type(2) .view-settings-check')).toBe('✓');

    fill?.click();
    crosshair?.click();
    lanes?.click();

    expect(fillToggled).toHaveBeenCalledTimes(1);
    expect(crosshairToggled).toHaveBeenCalledTimes(1);
    expect(lanesToggled).toHaveBeenCalledTimes(1);
  });
});
