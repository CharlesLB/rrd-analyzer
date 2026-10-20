import { describe, expect, it } from 'vitest';
import { runKeyOf, runProgressAt, stageIndexAt } from './insights-run';

describe('stageIndexAt', () => {
  it('reads series, then detects change-points past 38%, then matches rules past 74%', () => {
    expect(stageIndexAt(0)).toBe(0);
    expect(stageIndexAt(0.379)).toBe(0);
    expect(stageIndexAt(0.38)).toBe(1);
    expect(stageIndexAt(0.74)).toBe(2);
    expect(stageIndexAt(1)).toBe(2);
  });
});

describe('runProgressAt', () => {
  it('fills over the 1.8 seconds a run usually takes, and holds short of full until the answer arrives', () => {
    expect(runProgressAt(0)).toBe(0);
    expect(runProgressAt(900)).toBe(0.5);
    expect(runProgressAt(1800)).toBe(0.95);
    expect(runProgressAt(60_000)).toBe(0.95);
  });
});

describe('runKeyOf', () => {
  it('keys a whole-data run once per analysis, and a viewport run by its window too', () => {
    expect(runKeyOf('a1', 'all', { fromMilliseconds: 1, untilMilliseconds: 2 })).toBe('a1|all');
    expect(runKeyOf('a2', 'all', { fromMilliseconds: 1, untilMilliseconds: 2 })).toBe('a2|all');
    expect(runKeyOf('a1', 'viewport', { fromMilliseconds: 1, untilMilliseconds: 2 })).toBe('a1|viewport|1|2');
  });
});
