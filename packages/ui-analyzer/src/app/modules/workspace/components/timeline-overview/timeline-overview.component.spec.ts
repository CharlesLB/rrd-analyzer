import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { overviewArtOf } from '../../models/timeline-strip/timeline-strip';
import { TimelineOverviewComponent } from './timeline-overview.component';

const SAMPLES = [10, 20, 15];

describe('TimelineOverviewComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the line and the area under it in the colour of the chart it follows', () => {
    const fixture = renderWithInputs(TimelineOverviewComponent, { overview: { samples: SAMPLES, color: SERIES_COLORS[0] } });

    expect(elementOf(fixture, '.timeline-overview-line')?.getAttribute('d')).toBe(overviewArtOf(SAMPLES).line);
    expect(elementOf(fixture, '.timeline-overview-line')?.getAttribute('stroke')).toBe(SERIES_COLORS[0]);
    expect(elementOf(fixture, '.timeline-overview-area')?.getAttribute('d')).toBe(overviewArtOf(SAMPLES).area);
    expect(elementOf(fixture, '.timeline-overview-area')?.getAttribute('fill')).toBe(SERIES_COLORS[0]);
    expect(elementOf(fixture, '.timeline-overview')?.getAttribute('viewBox')).toBe('0 0 1000 24');
  });
});
