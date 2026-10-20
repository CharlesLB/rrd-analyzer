import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { seriesFixture } from '../../../../stores/workspace/models/series/series.fixture';
import type { LibraryEntry } from '../../../../stores/workspace/models/series/series.model';
import { LibraryStripCardComponent } from './library-strip-card.component';

const entryOf = (isOnCanvas: boolean): LibraryEntry => ({ series: seriesFixture(1), samples: [1, 2], isOnCanvas, isActive: false });

describe('LibraryStripCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('marks a chart on the canvas with a check and one off it with a plus', () => {
    expect(textOf(renderWithInputs(LibraryStripCardComponent, { entry: entryOf(true), showsAreaFill: true }), '.library-strip-card-toggle')).toBe('✓');
    expect(textOf(renderWithInputs(LibraryStripCardComponent, { entry: entryOf(false), showsAreaFill: true }), '.library-strip-card-toggle')).toBe('＋');
  });

  it('toggles its chart on the canvas from its mark without opening it', () => {
    const fixture = renderWithInputs(LibraryStripCardComponent, { entry: entryOf(false), showsAreaFill: true });
    const toggled = vi.fn();
    const opened = vi.fn();
    fixture.componentInstance.canvasToggled.subscribe(toggled);
    fixture.componentInstance.opened.subscribe(opened);

    elementOf(fixture, '.library-strip-card-toggle')?.click();

    expect(toggled).toHaveBeenCalledWith('s1');
    expect(opened).not.toHaveBeenCalled();
  });

  it('asks for its context menu where the pointer is, keeping the browser menu away', () => {
    const fixture = renderWithInputs(LibraryStripCardComponent, { entry: entryOf(false), showsAreaFill: true });
    const requested = vi.fn();
    fixture.componentInstance.contextMenuRequested.subscribe(requested);
    const event = new MouseEvent('contextmenu', { clientX: 60, clientY: 200, cancelable: true });

    elementOf(fixture, '.library-strip-card')?.dispatchEvent(event);

    expect(requested).toHaveBeenCalledWith({ seriesId: 's1', clientX: 60, clientY: 200 });
    expect(event.defaultPrevented).toBe(true);
  });
});
