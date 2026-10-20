import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ChartDropIndicatorComponent } from './chart-drop-indicator.component';

describe('ChartDropIndicatorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws a bar along the top edge before a chart and along the bottom edge after it', () => {
    expect(
      elementOf(renderWithInputs(ChartDropIndicatorComponent, { position: 'before' }), '.chart-drop-indicator-bar.chart-drop-indicator-before'),
    ).not.toBeNull();
    expect(
      elementOf(renderWithInputs(ChartDropIndicatorComponent, { position: 'after' }), '.chart-drop-indicator-bar.chart-drop-indicator-after'),
    ).not.toBeNull();
  });

  it('covers the chart with a box that names the merge', () => {
    const merging = renderWithInputs(ChartDropIndicatorComponent, { position: 'merge' });

    expect(textOf(merging, '.chart-drop-indicator-merge .chart-drop-indicator-label')).toBe('Merge');
    expect(elementOf(merging, '.chart-drop-indicator-bar')).toBeNull();
  });
});
