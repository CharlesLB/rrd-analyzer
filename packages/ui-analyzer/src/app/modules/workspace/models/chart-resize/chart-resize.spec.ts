import { describe, expect, it } from 'vitest';
import { MAXIMUM_CHART_HEIGHT, MINIMUM_CHART_HEIGHT, nudgedHeightOf, resizedHeightOf, startedResize } from './chart-resize';

const GESTURE = startedResize(400, 300);

describe('resizedHeightOf', () => {
  it('grows the chart by how far the pointer moved down, and shrinks it by how far it moved up', () => {
    expect(resizedHeightOf(GESTURE, 460)).toBe(360);
    expect(resizedHeightOf(GESTURE, 340)).toBe(240);
    expect(resizedHeightOf(GESTURE, 400)).toBe(300);
  });

  it('never reads a fractional pixel back from the pointer', () => {
    expect(resizedHeightOf(startedResize(400.5, 300.25), 460.1)).toBe(360);
  });

  it('stops at the shortest and the tallest a chart may be', () => {
    expect(resizedHeightOf(GESTURE, 0)).toBe(MINIMUM_CHART_HEIGHT);
    expect(resizedHeightOf(GESTURE, 9000)).toBe(MAXIMUM_CHART_HEIGHT);
  });
});

describe('nudgedHeightOf', () => {
  it('steps the height sixteen pixels per key press, within the same shortest and tallest', () => {
    expect(nudgedHeightOf(300, 1)).toBe(316);
    expect(nudgedHeightOf(300, -1)).toBe(284);
    expect(nudgedHeightOf(MINIMUM_CHART_HEIGHT, -1)).toBe(MINIMUM_CHART_HEIGHT);
  });
});

describe('startedResize', () => {
  it('remembers the height the chart had before the drag, none for one sized automatically, so a cancelled drag can put it back', () => {
    expect(startedResize(400, 300, 260).heightBefore).toBe(260);
    expect(startedResize(400, 300).heightBefore).toBeNull();
  });
});
