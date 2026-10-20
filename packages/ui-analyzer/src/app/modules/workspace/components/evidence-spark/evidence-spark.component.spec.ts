import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { sparkPathOf } from '../../models/evidence-view/evidence-view';
import { EvidenceSparkComponent } from './evidence-spark.component';

const POINTS = [1, 2, null, 3];

describe('EvidenceSparkComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the points of the evidence in the colour it is given, on the box the path is computed for', () => {
    const fixture = renderWithInputs(EvidenceSparkComponent, { points: POINTS, color: SERIES_COLORS[2] });

    expect(elementOf(fixture, '.evidence-spark-line')?.getAttribute('d')).toBe(sparkPathOf(POINTS));
    expect(elementOf(fixture, '.evidence-spark-line')?.getAttribute('stroke')).toBe(SERIES_COLORS[2]);
    expect(elementOf(fixture, '.evidence-spark')?.getAttribute('viewBox')).toBe('0 0 60 20');
  });
});
