import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, elementsOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { thumbnailPathsOf } from '../../models/sparkline-path/sparkline-path';
import { SparklineComponent } from './sparkline.component';

const SAMPLES = [10, 20, null, 15];

describe('SparklineComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('sparkline with area fill draws the line in the series color over an area tinted with it', () => {
    const fixture = renderWithInputs(SparklineComponent, { samples: SAMPLES, color: SERIES_COLORS[3], showsAreaFill: true });
    const [area, line] = elementsOf(fixture, 'path');

    expect(line?.getAttribute('d')).toBe(thumbnailPathsOf(SAMPLES).line);
    expect(line?.getAttribute('stroke')).toBe(SERIES_COLORS[3]);
    expect(area?.getAttribute('d')).toBe(thumbnailPathsOf(SAMPLES).area);
    expect(area?.getAttribute('fill')).toBe(`color-mix(in srgb,${SERIES_COLORS[3]} 14%,transparent)`);
    expect(elementOf(fixture, '.sparkline')?.getAttribute('viewBox')).toBe('0 0 100 30');
  });

  it('sparkline without area fill draws the line alone', () => {
    const fixture = renderWithInputs(SparklineComponent, { samples: SAMPLES, color: SERIES_COLORS[3], showsAreaFill: false });

    expect(elementsOf(fixture, 'path')[0]?.getAttribute('fill')).toBe('none');
    expect(elementOf(fixture, '.sparkline-line')?.getAttribute('d')).toBe(thumbnailPathsOf(SAMPLES).line);
  });
});
