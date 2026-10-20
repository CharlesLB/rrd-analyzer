import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import type { Evidence, Finding } from '../finding/finding.model';
import { evidenceFrameOf, findingFrameOf } from './finding-frame';

describe('frames', () => {
  it('pads a finding by 35% of its length, and by at least half an hour', () => {
    expect(findingFrameOf({ fromMilliseconds: 10 * MILLISECONDS_PER_HOUR, untilMilliseconds: 20 * MILLISECONDS_PER_HOUR } as Finding)).toEqual({
      fromMilliseconds: 6.5 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: 23.5 * MILLISECONDS_PER_HOUR,
    });
    expect(findingFrameOf({ fromMilliseconds: MILLISECONDS_PER_HOUR, untilMilliseconds: 2 * MILLISECONDS_PER_HOUR } as Finding)).toEqual({
      fromMilliseconds: 0.5 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: 2.5 * MILLISECONDS_PER_HOUR,
    });
  });

  it('pads evidence by half its length, by at least twenty minutes, and gives an instant one step of width', () => {
    expect(
      evidenceFrameOf({ fromMilliseconds: 10 * MILLISECONDS_PER_HOUR, untilMilliseconds: 12 * MILLISECONDS_PER_HOUR } as Evidence, 5 * MILLISECONDS_PER_MINUTE),
    ).toEqual({
      fromMilliseconds: 9 * MILLISECONDS_PER_HOUR,
      untilMilliseconds: 13 * MILLISECONDS_PER_HOUR,
    });
    expect(
      evidenceFrameOf({ fromMilliseconds: 10 * MILLISECONDS_PER_HOUR, untilMilliseconds: 10 * MILLISECONDS_PER_HOUR } as Evidence, 5 * MILLISECONDS_PER_MINUTE),
    ).toEqual({
      fromMilliseconds: 10 * MILLISECONDS_PER_HOUR - 20 * MILLISECONDS_PER_MINUTE,
      untilMilliseconds: 10 * MILLISECONDS_PER_HOUR + 25 * MILLISECONDS_PER_MINUTE,
    });
  });
});
