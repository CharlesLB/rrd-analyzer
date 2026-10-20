import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { Evidence } from '../../../../stores/insights/models/finding/finding.model';
import { EvidenceChipComponent } from './evidence-chip.component';

const EVIDENCE: Evidence = {
  semantic: 'heap.objects',
  seriesId: 's2',
  source: 'atlas_runtime_heap_objects.rrd',
  direction: 'rising',
  fromMilliseconds: new Date(2026, 7, 18, 2, 20).getTime(),
  untilMilliseconds: new Date(2026, 7, 18, 5, 20).getTime(),
  fromValue: 1_080_000,
  toValue: 1_370_000,
  unit: '',
  spark: [1, 2, 3],
};

const renderChip = (plottedColor: string | null) => renderWithInputs(EvidenceChipComponent, { evidence: EVIDENCE, severity: 'critical', plottedColor });

describe('EvidenceChipComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the semantic badge, the direction, the values, the source and the span', () => {
    const fixture = renderChip(null);

    expect(textOf(fixture, '.evidence-chip-badge')).toBe('heap.objects');
    expect(textOf(fixture, '.evidence-chip-glyph')).toBe('↑');
    expect(textOf(fixture, '.evidence-chip-span-values')).toBe('1.08M → 1.37M');
    expect(textOf(fixture, '.evidence-chip-source')).toBe('atlas_runtime_heap_objects.rrd');
    expect(textOf(fixture, '.evidence-chip-when')).toBe('18/08 02:20 → 05:20');
  });

  it('offers to plot a series that is not on the canvas, and tints the badge of one that is', () => {
    expect(textOf(renderChip(null), '.evidence-chip-plot')).toBe('plot this series');

    const plotted = renderChip(SERIES_COLORS[2]);

    expect(elementOf(plotted, '.evidence-chip-plot')).toBeNull();
    expect(elementOf(plotted, '.evidence-spark-line')?.getAttribute('stroke')).toBe(SERIES_COLORS[2]);
  });

  it('asks to jump to the span when pressed, and to plot without also jumping', () => {
    const fixture = renderChip(null);
    const jumped = vi.fn();
    const plotted = vi.fn();
    fixture.componentInstance.jumpRequested.subscribe(jumped);
    fixture.componentInstance.plotRequested.subscribe(plotted);

    elementOf(fixture, '.evidence-chip-plot')?.click();
    elementOf(fixture, '.evidence-chip')?.click();

    expect(plotted).toHaveBeenCalledTimes(1);
    expect(jumped).toHaveBeenCalledTimes(1);
  });

  it('lets a press on the chip reach the page, so a menu open elsewhere still closes', () => {
    const fixture = renderChip(null);
    const reachedPage = vi.fn();
    document.addEventListener('click', reachedPage);

    elementOf(fixture, '.evidence-chip')?.click();
    document.removeEventListener('click', reachedPage);

    expect(reachedPage).toHaveBeenCalledTimes(1);
  });
});
