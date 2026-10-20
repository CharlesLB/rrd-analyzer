import { describe, expect, it } from 'vitest';
import { chartOf } from '../plotted-chart/plotted-chart';
import { chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { EMPTY_HISTORY, REMEMBERED_CANVASES, recorded, redone, undone } from './canvas-history';

const FIRST = [chartOf('s0')];
const SECOND = [chartOf('s0'), chartOf('s1')];

const THIRD = [chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's1', axis: 1 })];

describe('recorded', () => {
  it('recorded keeps the canvas a change replaced, and forgets whatever had been undone before it', () => {
    const undoneOnce = { past: [FIRST], future: [THIRD] };

    expect(recorded(undoneOnce, SECOND)).toEqual({ past: [FIRST, SECOND], future: [] });
  });

  it('recorded remembers only the last fifty canvases', () => {
    const full = { past: Array.from({ length: REMEMBERED_CANVASES }, (_unused, index) => [chartOf(`s${index}`)]), future: [] };

    const history = recorded(full, SECOND);

    expect(history.past).toHaveLength(REMEMBERED_CANVASES);
    expect(history.past.at(-1)).toBe(SECOND);
    expect(history.past[0]).toEqual([chartOf('s1')]);
  });
});

describe('undone', () => {
  it('undone steps back to the canvas before the last change, keeping the current one to redo', () => {
    expect(undone({ past: [FIRST, SECOND], future: [] }, THIRD)).toEqual({ history: { past: [FIRST], future: [THIRD] }, canvas: SECOND });
  });

  it('undone with nothing changed yet has nothing to step back to', () => {
    expect(undone(EMPTY_HISTORY, FIRST)).toBeNull();
  });
});

describe('redone', () => {
  it('redone steps forward to the canvas last undone', () => {
    expect(redone({ past: [FIRST], future: [THIRD] }, SECOND)).toEqual({ history: { past: [FIRST, SECOND], future: [] }, canvas: THIRD });
  });

  it('redone with nothing undone has nothing to step forward to', () => {
    expect(redone({ past: [FIRST], future: [] }, SECOND)).toBeNull();
  });
});
