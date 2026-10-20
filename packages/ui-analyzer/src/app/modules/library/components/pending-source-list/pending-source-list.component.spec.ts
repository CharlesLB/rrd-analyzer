import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { PendingSourceListComponent } from './pending-source-list.component';

const SOURCES = [
  { name: 'atlas_prod.rrd', path: '', size: 2048 },
  { name: 'atlas_replica.rrd', path: '', size: 3 * 1_048_576 },
];

describe('PendingSourceListComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('says an analysis needs a source while none is listed', () => {
    const fixture = renderWithInputs(PendingSourceListComponent, { sources: [] });

    expect(textOf(fixture, '.pending-source-list-empty')).toBe('No files yet, and an analysis needs at least one source.');
    expect(elementOf(fixture, '.pending-source-list')).toBeNull();
  });

  it('lists each source with its size and a palette swatch, under a count in the plural it calls for', () => {
    const fixture = renderWithInputs(PendingSourceListComponent, { sources: SOURCES });

    expect(textOf(fixture, '.pending-source-list-count')).toBe('2 files');
    expect(textsOf(fixture, '.pending-source-list-name')).toEqual(['atlas_prod.rrd', 'atlas_replica.rrd']);
    expect(textsOf(fixture, '.pending-source-list-size')).toEqual(['2 KB', '3.0 MB']);
    expect(countOf(fixture, '.pending-source-list-row .color-swatch')).toBe(2);
    expect(textOf(renderWithInputs(PendingSourceListComponent, { sources: [SOURCES[0]] }), '.pending-source-list-count')).toBe('1 file');
  });

  it('lists two files of the same name from different folders, each telling its path apart', () => {
    const fixture = renderWithInputs(PendingSourceListComponent, {
      sources: [
        { name: 'cpu.rrd', path: '/host1/cpu.rrd', size: 1 },
        { name: 'cpu.rrd', path: '/host2/cpu.rrd', size: 1 },
      ],
    });

    expect(elementsOf(fixture, '.pending-source-list-name').map((name) => name.title)).toEqual(['/host1/cpu.rrd', '/host2/cpu.rrd']);
  });

  it('asks to remove one source by its place, or all of them', () => {
    const fixture = renderWithInputs(PendingSourceListComponent, { sources: SOURCES });
    const removed = vi.fn();
    const cleared = vi.fn();
    fixture.componentInstance.removed.subscribe(removed);
    fixture.componentInstance.clearedAll.subscribe(cleared);

    elementsOf(fixture, '.pending-source-list-row-remove')[1]?.click();
    elementOf(fixture, '.pending-source-list-clear')?.click();

    expect(removed).toHaveBeenCalledWith(1);
    expect(cleared).toHaveBeenCalledTimes(1);
  });
});
