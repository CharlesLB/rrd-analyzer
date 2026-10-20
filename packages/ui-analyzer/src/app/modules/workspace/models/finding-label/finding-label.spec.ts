import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { Finding } from '../../../../stores/insights/models/finding/finding.model';
import { findingCountLabelOf, findingIntervalOf } from './finding-label';

const texts = messagesFor();
const at = (day: number, hours: number, minutes = 0): number => new Date(2026, 7, day, hours, minutes).getTime();

describe('finding labels', () => {
  const finding = { fromMilliseconds: at(18, 2, 20), untilMilliseconds: at(18, 9, 15) } as Finding;

  it('writes the interval with an en dash', () => {
    expect(findingIntervalOf(finding)).toBe('18/08 02:20 – 18/08 09:15');
  });

  it('counts findings, or says there are none', () => {
    expect(findingCountLabelOf([finding, finding, finding], texts.insights)).toBe('3 findings');
    expect(findingCountLabelOf([finding], texts.insights)).toBe('1 finding');
    expect(findingCountLabelOf([], texts.insights)).toBe('no findings');
  });
});
