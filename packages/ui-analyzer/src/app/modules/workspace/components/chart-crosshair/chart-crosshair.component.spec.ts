import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { countOf, cssColorOf, elementOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { CrosshairReading } from '../../models/chart-reading/chart-reading';
import { ChartCrosshairComponent } from './chart-crosshair.component';

const READING: CrosshairReading = { seriesId: 's3', top: '44.5%', color: SERIES_COLORS[3], value: '44.9%' };
const SECOND_READING: CrosshairReading = { seriesId: 's5', top: '71.2%', color: SERIES_COLORS[5], value: '4.73 GiB' };

const renderCrosshair = (fraction: number, readings: readonly CrosshairReading[] = [READING]) =>
  renderWithInputs(ChartCrosshairComponent, { fraction, time: '29/08 01:04', readings });

describe('ChartCrosshairComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('crosshair over a reading draws the dashed line, a dot on the sample and a card with the time and the value in the series color', () => {
    const fixture = renderCrosshair(0.4194);

    expect(elementOf(fixture, '.chart-crosshair-line')?.style.left).toBe('41.94%');
    expect(elementOf(fixture, '.chart-crosshair-dot')?.style.top).toBe('44.5%');
    expect(elementOf(fixture, '.chart-crosshair-dot')?.style.background).toBe(cssColorOf(SERIES_COLORS[3]));
    expect(textOf(fixture, '.chart-crosshair-tip-time')).toBe('29/08 01:04');
    expect(textOf(fixture, '.chart-crosshair-tip-value')).toBe('44.9%');
    expect(elementOf(fixture, '.chart-crosshair-tip-reading .color-swatch')?.style.background).toBe(cssColorOf(SERIES_COLORS[3]));
  });

  it('crosshair over a merged chart draws a dot on every line and lists every value in one card, beside the first dot', () => {
    const fixture = renderCrosshair(0.4194, [READING, SECOND_READING]);

    expect(countOf(fixture, '.chart-crosshair-dot')).toBe(2);
    expect(countOf(fixture, '.chart-crosshair-tip')).toBe(1);
    expect(textsOf(fixture, '.chart-crosshair-tip-value')).toEqual(['44.9%', '4.73 GiB']);
    expect(elementOf(fixture, '.chart-crosshair-tip')?.style.top).toBe('44.5%');
  });

  it('crosshair up to 62% of the window keeps the card to the right of the dot', () => {
    expect(elementOf(renderCrosshair(0.62), '.chart-crosshair-tip-flipped')).toBeNull();
  });

  it('crosshair past 62% of the window flips the card to the left of the dot so it never clips the right edge', () => {
    expect(elementOf(renderCrosshair(0.6801), '.chart-crosshair-tip-flipped')).not.toBeNull();
  });

  it('crosshair over a gap in the data keeps the line, draws no dot, and says the time and that there is no data, halfway up the plot', () => {
    const fixture = renderCrosshair(0.5, []);

    expect(elementOf(fixture, '.chart-crosshair-line')).not.toBeNull();
    expect(elementOf(fixture, '.chart-crosshair-dot')).toBeNull();
    expect(textOf(fixture, '.chart-crosshair-tip-time')).toBe('29/08 01:04');
    expect(textOf(fixture, '.chart-crosshair-tip-gap')).toBe('no data');
    expect(elementOf(fixture, '.chart-crosshair-tip')?.style.top).toBe('50%');
  });

  it('crosshair over a reading says nothing about missing data', () => {
    expect(elementOf(renderCrosshair(0.4), '.chart-crosshair-tip-gap')).toBeNull();
  });
});
