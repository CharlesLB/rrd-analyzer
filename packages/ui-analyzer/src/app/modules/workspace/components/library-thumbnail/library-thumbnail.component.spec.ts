import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { elementOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { CPU_USER_SERIES } from '../../../../stores/workspace/models/series/series.fixture';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { LibraryThumbnailComponent } from './library-thumbnail.component';

const entry = (overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
  series: CPU_USER_SERIES,
  samples: [10, 20, null, 30],
  isOnCanvas: false,
  isActive: false,
  ...overrides,
});

const renderThumbnail = (overrides: Partial<LibraryEntry> = {}, showsAreaFill = true) =>
  renderWithInputs(LibraryThumbnailComponent, { entry: entry(overrides), showsAreaFill });

const card = (fixture: ReturnType<typeof renderThumbnail>): HTMLElement | null => elementOf(fixture, '.library-thumbnail');

describe('LibraryThumbnailComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('names the series by its label with its unit, and draws its line in its colour', () => {
    const fixture = renderThumbnail();
    const paths = elementsOf(fixture, 'path');

    expect(textOf(fixture, '.library-thumbnail-name')).toBe('system_cpu_user');
    expect(textOf(fixture, '.library-thumbnail-unit')).toBe('%');
    expect(paths[1]?.getAttribute('stroke')).toBe(SERIES_COLORS[3]);
    expect(paths[0]?.getAttribute('fill')).toBe(`color-mix(in srgb,${SERIES_COLORS[3]} 14%,transparent)`);
    expect(card(fixture)?.getAttribute('title')).toBe('atlas_system_cpu_user.rrd');
  });

  it('marks a chart on the canvas, and the active one, and says so in its tip', () => {
    const fixture = renderThumbnail({ isOnCanvas: true, isActive: true });

    expect(card(fixture)?.classList.contains('library-thumbnail-on-canvas')).toBe(true);
    expect(card(fixture)?.classList.contains('library-thumbnail-active')).toBe(true);
    expect(card(fixture)?.getAttribute('title')).toBe('atlas_system_cpu_user.rrd · on canvas');
  });

  it('leaves the area unfilled when the setting is off', () => {
    const paths = elementsOf(renderThumbnail({}, false), 'path');

    expect(paths[0]?.getAttribute('d')).toBe('');
    expect(paths[0]?.getAttribute('fill')).toBe('none');
  });

  it('reports a click, a right click at the pointer, and a drag', () => {
    const fixture = renderThumbnail();
    const opened = vi.fn();
    const contextMenu = vi.fn();
    const dragged = vi.fn();
    fixture.componentInstance.opened.subscribe(opened);
    fixture.componentInstance.contextMenuRequested.subscribe(contextMenu);
    fixture.componentInstance.dragStarted.subscribe(dragged);

    card(fixture)?.click();
    card(fixture)?.dispatchEvent(new MouseEvent('contextmenu', { clientX: 40, clientY: 80, cancelable: true }));
    card(fixture)?.dispatchEvent(new Event('dragstart'));

    expect(opened).toHaveBeenCalledWith(CPU_USER_SERIES.id);
    expect(contextMenu).toHaveBeenCalledWith({ seriesId: CPU_USER_SERIES.id, clientX: 40, clientY: 80 });
    expect(dragged).toHaveBeenCalledWith(CPU_USER_SERIES.id);
  });
});
