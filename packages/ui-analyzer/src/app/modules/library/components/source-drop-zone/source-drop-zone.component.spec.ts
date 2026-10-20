import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { SourceDropZoneComponent } from './source-drop-zone.component';

const ZONE_BOUNDS = { left: 0, top: 0, right: 200, bottom: 100 };
const INSIDE_THE_ZONE = { clientX: 50, clientY: 50 };
const OUTSIDE_THE_ZONE = { clientX: 300, clientY: 50 };

const dragEventOf = (type: string, point: { clientX: number; clientY: number } = OUTSIDE_THE_ZONE): Event =>
  new MouseEvent(type, { bubbles: true, cancelable: true, ...point });

describe('SourceDropZoneComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('invites a drop or a click, and is marked while a drag hovers it', () => {
    const idle = renderWithInputs(SourceDropZoneComponent, { isActive: false });

    expect(textOf(idle, '.source-drop-zone-title')).toBe('Drop .rrd or .xml files here');
    expect(elementOf(idle, '.source-drop-zone-active')).toBeNull();
    expect(elementOf(renderWithInputs(SourceDropZoneComponent, { isActive: true }), '.source-drop-zone-active')).not.toBeNull();
  });

  it('asks to browse when pressed, with the mouse or from the keyboard as a button would', () => {
    const fixture = renderWithInputs(SourceDropZoneComponent, { isActive: false });
    const browse = vi.fn();
    fixture.componentInstance.browseRequested.subscribe(browse);
    const zone = elementOf(fixture, '.source-drop-zone');

    zone?.click();
    zone?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(zone?.getAttribute('role')).toBe('button');
    expect(browse).toHaveBeenCalledTimes(2);
  });

  it('reports a drag coming and going, and the files dropped on it', () => {
    const fixture = renderWithInputs(SourceDropZoneComponent, { isActive: false });
    const hovering = vi.fn();
    const dropped = vi.fn();
    fixture.componentInstance.hoverChanged.subscribe(hovering);
    fixture.componentInstance.filesDropped.subscribe(dropped);
    const zone = elementOf(fixture, '.source-drop-zone');
    const over = dragEventOf('dragover', INSIDE_THE_ZONE);

    zone?.dispatchEvent(dragEventOf('dragenter', INSIDE_THE_ZONE));
    zone?.dispatchEvent(over);
    zone?.dispatchEvent(over);
    zone?.dispatchEvent(dragEventOf('dragleave'));
    zone?.dispatchEvent(dragEventOf('drop'));

    expect(over.defaultPrevented).toBe(true);
    expect(hovering.mock.calls).toEqual([[true], [false], [false]]);
    expect(dropped).toHaveBeenCalledWith([]);
  });

  it('stays marked while the drag only crosses onto its own title, which fires a leave of its own', () => {
    const fixture = renderWithInputs(SourceDropZoneComponent, { isActive: true });
    const hovering = vi.fn();
    fixture.componentInstance.hoverChanged.subscribe(hovering);
    const zone = elementOf(fixture, '.source-drop-zone');
    vi.spyOn(zone as HTMLElement, 'getBoundingClientRect').mockReturnValue(ZONE_BOUNDS as DOMRect);

    zone?.dispatchEvent(dragEventOf('dragleave', INSIDE_THE_ZONE));

    expect(hovering).not.toHaveBeenCalled();

    zone?.dispatchEvent(dragEventOf('dragleave', OUTSIDE_THE_ZONE));

    expect(hovering.mock.calls).toEqual([[false]]);
  });
});
