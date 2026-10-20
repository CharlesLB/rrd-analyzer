import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { countOf, elementOf, elementsOf, renderWithInputs, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { STATISTIC_KEYS } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { NO_OVERLAYS } from '../../models/insight-overlay/insight-overlay';
import { ChartPlotComponent } from './chart-plot.component';

const SINGLE_AXIS_ROWS = [
  { topPercent: '4%', values: [{ text: '100.0%', color: null }] },
  { topPercent: '96%', values: [{ text: '0.0%', color: null }] },
];

const renderPlot = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ChartPlotComponent, {
    lines: [{ seriesId: 's3', color: SERIES_COLORS[0], path: 'M0.0 50.0 L1000.0 20.0' }],
    axisRows: SINGLE_AXIS_ROWS,
    referenceLines: [],
    referenceColor: SERIES_COLORS[0],
    overlays: NO_OVERLAYS,
    ...overrides,
  });

const REFERENCE_LINES = [
  { key: STATISTIC_KEYS.AVERAGE, y: 40, dash: '6 4', label: 'avg 42.6', labelTop: '40.00%' },
  { key: STATISTIC_KEYS.MAXIMUM, y: 20, dash: '2 3', label: 'max 56.4', labelTop: '29.00%' },
];

describe('ChartPlotComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the lines it is given, with the axis labels beside them', () => {
    const fixture = renderPlot();

    expect(countOf(fixture, '.plot-drawing-line')).toBe(1);
    expect(textsOf(fixture, '.chart-plot-axis-label')).toEqual(['100.0%', '0.0%']);
  });

  it('labels every axis side by side on the left, in the color of each', () => {
    const fixture = renderPlot({
      axisRows: [
        {
          topPercent: '4%',
          values: [
            { text: '100.0%', color: SERIES_COLORS[3] },
            { text: '180 ms', color: SERIES_COLORS[2] },
            { text: '5.00 GiB', color: SERIES_COLORS[5] },
          ],
        },
      ],
    });

    expect(countOf(fixture, '.chart-plot-axis-label')).toBe(1);
    expect(textsOf(fixture, '.chart-plot-axis-value')).toEqual(['100.0%', '180 ms', '5.00 GiB']);
    expect(elementOf(fixture, '.chart-plot-axis-value-colored')?.style.getPropertyValue('--axis-color')).toBe(SERIES_COLORS[3]);
  });

  it('leaves the labels of a single axis in the muted default color', () => {
    expect(elementOf(renderPlot(), '.chart-plot-axis-value-colored')).toBeNull();
  });

  it('draws each reference line and pins its label to the right, at the height of the line', () => {
    const fixture = renderPlot({ referenceLines: REFERENCE_LINES });

    expect(countOf(fixture, '.plot-drawing-reference')).toBe(2);
    expect(textsOf(fixture, '.chart-plot-reference-label')).toEqual(['avg 42.6', 'max 56.4']);
    expect(elementsOf(fixture, '.chart-plot-reference-label').map((label) => label.style.top)).toEqual(['40%', '29%']);
  });
});
