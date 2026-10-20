import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { seriesFixture } from '../../../../stores/workspace/models/series/series.fixture';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { ChartLibraryComponent } from './chart-library.component';

const entryFor = (index: number): LibraryEntry => ({ series: seriesFixture(index), samples: [1, 2], isOnCanvas: false, isActive: false });

const renderLibrary = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ChartLibraryComponent, {
    entries: [entryFor(0), entryFor(1)],
    totalCount: 10,
    filter: '',
    filterHistory: [],
    isCollapsed: false,
    showsAreaFill: true,
    ...overrides,
  });

describe('ChartLibraryComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('counts the charts shown out of all of them and lists a card for each', () => {
    const fixture = renderLibrary();

    expect(textOf(fixture, '.chart-library-count')).toBe('2 of 10');
    expect(countOf(fixture, 'app-library-thumbnail')).toBe(2);
  });

  it('says so when the filter matches nothing', () => {
    const fixture = renderLibrary({ entries: [], filter: 'zzz' });

    expect(textOf(fixture, '.chart-library-count')).toBe('0 of 10');
    expect(textOf(fixture, '.chart-library-empty')).toBe('No charts match.');
  });

  it('collapses to a rail that expands it again', () => {
    const fixture = renderLibrary({ isCollapsed: true });
    const toggled = vi.fn();
    fixture.componentInstance.collapseToggled.subscribe(toggled);

    expect(elementOf(fixture, '.chart-library')).toBeNull();

    elementOf(fixture, '.chart-library-rail .chart-library-toggle')?.click();

    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('reports the typed filter and names the series behind a card event', () => {
    const fixture = renderLibrary();
    const filtered = vi.fn();
    const opened = vi.fn();
    const contextMenu = vi.fn();
    fixture.componentInstance.filterChanged.subscribe(filtered);
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.contextMenuRequested.subscribe(contextMenu);
    const cards = elementsOf(fixture, '.library-thumbnail');

    typeInto(fixture, '.chart-library-filter input', 'cpu');
    cards[1]?.click();
    cards[0]?.dispatchEvent(new MouseEvent('contextmenu', { clientX: 5, clientY: 6, cancelable: true }));

    expect(filtered).toHaveBeenCalledWith('cpu');
    expect(opened).toHaveBeenCalledWith('s1');
    expect(contextMenu).toHaveBeenCalledWith({ seriesId: 's0', clientX: 5, clientY: 6 });
  });

  it('offers the recent filters and reports the one picked, and the one asked to be forgotten', () => {
    const fixture = renderLibrary({ filterHistory: ['memory', 'cpu'] });
    const committed = vi.fn();
    const forgotten = vi.fn();
    fixture.componentInstance.filterCommitted.subscribe(committed);
    fixture.componentInstance.filterForgotten.subscribe(forgotten);

    elementOf(fixture, '.chart-library-filter input')?.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    elementsOf(fixture, '.search-field-history-forget')[0]?.click();
    elementsOf(fixture, '.search-field-history-item')[1]?.click();

    expect(forgotten).toHaveBeenCalledWith('memory');
    expect(committed).toHaveBeenCalledWith('cpu');
  });

  it('Escape in the filter clears what is typed, and with nothing typed gives the focus up', () => {
    const typed = renderLibrary({ filter: 'cpu' });
    const changed = vi.fn();
    typed.componentInstance.filterChanged.subscribe(changed);

    elementOf(typed, '.chart-library-filter input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(changed).toHaveBeenCalledWith('');

    const empty = renderLibrary({ filter: '' });
    const field = elementOf(empty, '.chart-library-filter input');
    document.body.append(empty.nativeElement);
    field?.focus();
    field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.activeElement).not.toBe(field);
  });
});
