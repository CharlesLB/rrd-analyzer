import { describe, expect, it } from 'vitest';
import { isSupportedSource, pendingSourcesOf, stripSourceExtension } from './source-file';

describe('isSupportedSource', () => {
  it('accepts rrd databases and xml dumps, whatever the case', () => {
    expect(isSupportedSource('atlas_prod.rrd')).toBe(true);
    expect(isSupportedSource('atlas_prod.XML')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSupportedSource('notes.txt')).toBe(false);
    expect(isSupportedSource('rrd')).toBe(false);
  });
});

describe('stripSourceExtension', () => {
  it('gives the name an unnamed analysis falls back to', () => {
    expect(stripSourceExtension('atlas-prod.rrd')).toBe('atlas-prod');
  });
});

describe('pendingSourcesOf', () => {
  it('pendingSourcesOf lists files dropped in a browser by name and size, with no path to read them from', () => {
    expect(pendingSourcesOf([new File([new Uint8Array(3)], 'atlas.rrd')])).toEqual([{ name: 'atlas.rrd', path: '', size: 3 }]);
  });
});
