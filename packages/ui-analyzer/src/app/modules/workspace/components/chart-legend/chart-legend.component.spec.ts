import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementsOf, renderWithInputs, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ChartLegendComponent } from './chart-legend.component';

const ENTRIES = [
  { seriesId: 's3', name: 'atlas_system_cpu_user', color: SERIES_COLORS[3], value: '44.9%', isLive: true },
  { seriesId: 's5', name: 'atlas_memory_used', color: SERIES_COLORS[5], value: 'no data', isLive: false },
];

describe('ChartLegendComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('lists every series with its colour and reading, marking the readings taken under the cursor', () => {
    const fixture = renderWithInputs(ChartLegendComponent, { entries: ENTRIES });

    expect(textsOf(fixture, '.chart-legend-name')).toEqual(['atlas_system_cpu_user', 'atlas_memory_used']);
    expect(textsOf(fixture, '.chart-legend-value')).toEqual(['44.9%', 'no data']);
    expect(elementsOf(fixture, '.chart-legend-value').map((value) => value.classList.contains('chart-legend-value-live'))).toEqual([true, false]);
  });
});
