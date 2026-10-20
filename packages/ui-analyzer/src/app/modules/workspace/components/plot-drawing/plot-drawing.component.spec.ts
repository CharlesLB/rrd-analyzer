import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS, THEME_COLORS } from '../../../../shared/constants/colors';
import { countOf, elementOf, elementsOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { STATISTIC_KEYS } from '../../../../stores/workspace/models/statistic-key/statistic-key';
import { PlotDrawingComponent } from './plot-drawing.component';

const OVERLAYS = {
  bands: [{ x: '100.0', width: '50.0', fill: THEME_COLORS.light.insCritFg, opacity: '0.1', stroke: 'none' }],
  marks: [{ x: '125.0', color: THEME_COLORS.light.insCritFg, opacity: '0.6' }],
};

const REFERENCE_LINES = [
  { key: STATISTIC_KEYS.AVERAGE, y: 40, dash: '6 4', label: 'avg 42.6', labelTop: '40.00%' },
  { key: STATISTIC_KEYS.MAXIMUM, y: 20, dash: '2 3', label: 'max 56.4', labelTop: '29.00%' },
];

const renderDrawing = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(PlotDrawingComponent, {
    lines: [{ seriesId: 's3', color: SERIES_COLORS[0], path: 'M0.0 50.0 L1000.0 20.0' }],
    referenceLines: [],
    referenceColor: SERIES_COLORS[0],
    overlays: OVERLAYS,
    ...overrides,
  });

describe('PlotDrawingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the line in the series color over the grid', () => {
    const fixture = renderDrawing();

    expect(elementOf(fixture, '.plot-drawing-line')?.getAttribute('d')).toBe('M0.0 50.0 L1000.0 20.0');
    expect(elementOf(fixture, '.plot-drawing-line')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(countOf(fixture, '.plot-drawing-grid')).toBe(11);
  });

  it('draws on the plot the paths are computed for, with the grid and every overlay spanning its full extent', () => {
    const fixture = renderDrawing();

    expect(elementOf(fixture, '.plot-drawing')?.getAttribute('viewBox')).toBe('0 0 1000 100');
    expect(elementOf(fixture, '.plot-drawing-grid')?.getAttribute('x2')).toBe('1000');
    expect(elementOf(fixture, '.plot-drawing-band')?.getAttribute('height')).toBe('100');
    expect(elementOf(fixture, '.plot-drawing-mark')?.getAttribute('y2')).toBe('100');
  });

  it('draws a line per merged series, each in its own color', () => {
    const fixture = renderDrawing({
      lines: [
        { seriesId: 's3', color: SERIES_COLORS[3], path: 'M0.0 50.0' },
        { seriesId: 's5', color: SERIES_COLORS[5], path: 'M0.0 70.0' },
      ],
    });

    expect(elementsOf(fixture, '.plot-drawing-line').map((line) => line.getAttribute('stroke'))).toEqual([SERIES_COLORS[3], SERIES_COLORS[5]]);
  });

  it('shades each finding band and marks each onset', () => {
    const fixture = renderDrawing();

    expect(elementOf(fixture, '.plot-drawing-band')?.getAttribute('x')).toBe('100.0');
    expect(elementOf(fixture, '.plot-drawing-mark')?.getAttribute('x1')).toBe('125.0');
  });

  it('draws each reference line under the data in the colour of the chart, and none when there are none', () => {
    const drawn = elementsOf(renderDrawing({ referenceLines: REFERENCE_LINES }), '.plot-drawing-reference');

    expect(drawn.map((line) => line.getAttribute('stroke-dasharray'))).toEqual(['6 4', '2 3']);
    expect(drawn.map((line) => line.getAttribute('y1'))).toEqual(['40', '20']);
    expect(drawn.every((line) => line.getAttribute('stroke') === SERIES_COLORS[0])).toBe(true);
    expect(countOf(renderDrawing(), '.plot-drawing-reference')).toBe(0);
  });

  it('marks a hovered log entry with a dashed line in its type colour and the selected one with a solid line', () => {
    const fixture = renderDrawing({
      logMarks: [
        { fraction: 0.25, x: 250, color: SERIES_COLORS[1], isSelected: false },
        { fraction: 0.5, x: 500, color: SERIES_COLORS[2], isSelected: true },
      ],
    });

    const marks = elementsOf(fixture, '.plot-drawing-log-mark');

    expect(marks.map((mark) => mark.getAttribute('x1'))).toEqual(['250', '500']);
    expect(marks.map((mark) => mark.getAttribute('stroke'))).toEqual([SERIES_COLORS[1], SERIES_COLORS[2]]);
    expect(marks.map((mark) => mark.classList.contains('plot-drawing-log-mark-selected'))).toEqual([false, true]);
    expect(countOf(renderDrawing(), '.plot-drawing-log-mark')).toBe(0);
  });
});
