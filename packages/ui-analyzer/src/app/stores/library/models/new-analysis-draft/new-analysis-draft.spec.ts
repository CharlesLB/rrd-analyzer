import { describe, expect, it } from 'vitest';
import { analysisNameOf, EMPTY_NEW_ANALYSIS_DRAFT, withoutSourceAt, withoutSources, withSourcesAdded } from './new-analysis-draft';

const sourceOf = (name: string, size = 1) => ({ name, path: '', size });
const UNTITLED = 'Untitled analysis';

describe('withSourcesAdded', () => {
  it('withSourcesAdded keeps the sources already listed and adds each new name once, as it was picked first', () => {
    const draft = withSourcesAdded(EMPTY_NEW_ANALYSIS_DRAFT, [sourceOf('a.rrd')]);

    expect(withSourcesAdded(draft, [sourceOf('a.rrd'), sourceOf('b.rrd', 2), sourceOf('b.rrd', 3)]).sources).toEqual([sourceOf('a.rrd'), sourceOf('b.rrd', 2)]);
  });

  it('withSourcesAdded keeps two files of the same name that come from different folders, and one path only once', () => {
    const fromFirstHost = { name: 'cpu.rrd', path: '/host1/cpu.rrd', size: 1 };
    const fromSecondHost = { name: 'cpu.rrd', path: '/host2/cpu.rrd', size: 1 };

    expect(withSourcesAdded(EMPTY_NEW_ANALYSIS_DRAFT, [fromFirstHost, fromSecondHost, fromFirstHost]).sources).toEqual([fromFirstHost, fromSecondHost]);
  });
});

describe('withoutSourceAt and withoutSources', () => {
  it('withoutSourceAt drops the source at that place only, and withoutSources drops them all but keeps the name', () => {
    const draft = { name: 'Capacity', sources: [sourceOf('a.rrd'), sourceOf('b.rrd'), sourceOf('c.rrd')] };

    expect(withoutSourceAt(draft, 1).sources.map((source) => source.name)).toEqual(['a.rrd', 'c.rrd']);
    expect(withoutSources(draft)).toEqual({ name: 'Capacity', sources: [] });
  });
});

describe('analysisNameOf', () => {
  it('analysisNameOf takes the typed name without its padding', () => {
    expect(analysisNameOf({ name: '  Capacity  ', sources: [sourceOf('a.rrd')] }, UNTITLED)).toBe('Capacity');
  });

  it('analysisNameOf without a name calls a single source after its file and several sources untitled', () => {
    expect(analysisNameOf({ name: ' ', sources: [sourceOf('atlas.prod.rrd')] }, UNTITLED)).toBe('atlas.prod');
    expect(analysisNameOf({ name: '', sources: [sourceOf('.rrd')] }, UNTITLED)).toBe(UNTITLED);
    expect(analysisNameOf({ name: '', sources: [sourceOf('a.rrd'), sourceOf('b.rrd')] }, UNTITLED)).toBe(UNTITLED);
  });
});
