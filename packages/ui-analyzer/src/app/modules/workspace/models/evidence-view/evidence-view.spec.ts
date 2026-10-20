import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import type { Evidence } from '../../../../stores/insights/models/finding/finding.model';
import { evidenceBadgeOf, evidenceGlyphColorOf, evidenceGlyphOf, evidenceSpanOf, evidenceValuesOf, sparkColorOf, sparkPathOf } from './evidence-view';

const texts = messagesFor();
const at = (day: number, hours: number, minutes = 0): number => new Date(2026, 7, day, hours, minutes).getTime();

const evidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  semantic: 'heap.objects',
  seriesId: 's2',
  source: 'atlas_runtime_heap_objects.rrd',
  direction: 'rising',
  fromMilliseconds: at(18, 2, 20),
  untilMilliseconds: at(18, 5, 20),
  fromValue: 1_080_000,
  toValue: 1_370_000,
  unit: '',
  spark: [1, 2, 3],
  ...overrides,
});

describe('evidence glyphs', () => {
  it('draws a gap or reset as an outage in the severity colour', () => {
    expect(evidenceGlyphOf(evidence({ direction: 'gap', fromValue: null, toValue: null }))).toBe('⤓');
    expect(evidenceGlyphColorOf(evidence({ direction: 'reset', fromValue: null, toValue: null }), 'critical')).toBe('var(--insCritFg)');
  });

  it('draws a trend as a slope and a span by the way its values moved', () => {
    expect(evidenceGlyphOf(evidence({ direction: 'trend' }))).toBe('↗');
    expect(evidenceGlyphOf(evidence())).toBe('↑');
    expect(evidenceGlyphOf(evidence({ fromValue: 9, toValue: 3 }))).toBe('↓');
    expect(evidenceGlyphColorOf(evidence(), 'warning')).toBe('var(--insRise)');
    expect(evidenceGlyphColorOf(evidence({ fromValue: 9, toValue: 3 }), 'warning')).toBe('var(--insFall)');
  });

  it('draws a reading that never moved as a level arrow in a neutral colour', () => {
    expect(evidenceGlyphOf(evidence({ direction: 'flat', fromValue: 58, toValue: 58 }))).toBe('→');
    expect(evidenceGlyphColorOf(evidence({ direction: 'flat', fromValue: 58, toValue: 58 }), 'warning')).toBe('var(--tx2)');
  });
});

describe('evidence badge and spark colour', () => {
  it('tints with the series colour only when the series is plotted', () => {
    expect(evidenceBadgeOf(SERIES_COLORS[2])).toEqual({
      color: `color-mix(in srgb,${SERIES_COLORS[2]} 55%,var(--tx))`,
      background: `color-mix(in srgb,${SERIES_COLORS[2]} 12%,transparent)`,
      border: `color-mix(in srgb,${SERIES_COLORS[2]} 45%,transparent)`,
    });
    expect(evidenceBadgeOf(null)).toEqual({ color: 'var(--tx2)', background: 'var(--surf2)', border: 'var(--line)' });
    expect(sparkColorOf(null)).toBe('var(--mut)');
  });
});

describe('evidence text', () => {
  it('reads a span from its first instant to the clock time of its last on the same day', () => {
    expect(evidenceSpanOf(evidence())).toBe('18/08 02:20 → 05:20');
    expect(evidenceSpanOf(evidence({ untilMilliseconds: at(19, 1, 0) }))).toBe('18/08 02:20 → 19/08 01:00');
    expect(evidenceSpanOf(evidence({ direction: 'gap' }))).toBe('18/08 02:20');
  });

  it('reads values from and to, or the length of an outage', () => {
    expect(evidenceValuesOf(evidence(), texts.insights, texts.units)).toBe('1.08M → 1.37M');
    expect(evidenceValuesOf(evidence({ direction: 'gap', untilMilliseconds: at(18, 6, 5) }), texts.insights, texts.units)).toBe('reset / gap · 3.8 h');
  });
});

describe('sparkPathOf', () => {
  it('fits the points into sixty by twenty and lifts the pen over holes', () => {
    expect(sparkPathOf([0, 10, null, 5])).toBe('M0.0 18.0 L20.0 2.0 M60.0 10.0');
  });

  it('draws a flat line when there is nothing to draw', () => {
    expect(sparkPathOf([null, null])).toBe('M0 18 L60 18');
  });
});
