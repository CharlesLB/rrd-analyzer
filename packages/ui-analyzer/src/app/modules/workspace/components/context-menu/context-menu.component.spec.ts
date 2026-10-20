import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { MergeTarget } from '../../../../stores/workspace/models/context-menu/context-menu';
import { ContextMenuComponent } from './context-menu.component';

const MERGE_TARGETS = [
  { chartId: 's0', label: 'system_cpu_user' },
  { chartId: 's1', label: 'system_memory_used + system_swap_used' },
];

const renderMenu = (isOnCanvas: boolean, isAtTopOfLibrary = false, mergeTargets: readonly MergeTarget[] = []) =>
  renderWithInputs(ContextMenuComponent, {
    title: 'atlas_system_cpu_system',
    placement: { seriesId: 's4', x: 120, y: 300 },
    isOnCanvas,
    isAtTopOfLibrary,
    mergeTargets,
  });

describe('ContextMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('offers to open or add a chart that is not on the canvas, placed at the pointer', () => {
    const fixture = renderMenu(false);
    const menu = elementOf(fixture, '.context-menu');

    expect(textOf(fixture, '.context-menu-title')).toBe('atlas_system_cpu_system');
    expect(textsOf(fixture, '.context-menu-item')).toEqual(['Open chart', 'Add to canvas', 'Move to top']);
    expect(menu?.style.left).toBe('120px');
    expect(menu?.style.top).toBe('300px');
  });

  it('groups what it offers under a heading for each section', () => {
    expect(textsOf(renderMenu(false), '.context-menu-heading')).toEqual(['Chart', 'Library']);
    expect(textsOf(renderMenu(false, false, MERGE_TARGETS), '.context-menu-heading')).toEqual(['Chart', 'Merge with', 'Library']);
  });

  it('offers to remove a chart already on the canvas, set apart as destructive', () => {
    const fixture = renderMenu(true);

    expect(textsOf(fixture, '.context-menu-item')).toEqual(['Open chart', 'Move to top', 'Remove from canvas']);
    expect(textOf(fixture, '.context-menu-item-danger')).toBe('Remove from canvas');
  });

  it('asks to move its chart to the top of the library, and cannot for the chart already there', () => {
    const fixture = renderMenu(false);
    const moved = vi.fn();
    fixture.componentInstance.moveToTopRequested.subscribe(moved);
    const moveToTop = elementsOf(fixture, '.context-menu-item').find((item) => item.textContent?.trim() === 'Move to top');

    moveToTop?.click();

    expect(moved).toHaveBeenCalledTimes(1);
    expect(elementOf(fixture, '.context-menu-item:disabled')).toBeNull();
    expect(textOf(renderMenu(false, true), '.context-menu-item:disabled')).toBe('Move to top');
  });

  it('offers one merge for each chart on the canvas, named after the series that chart draws', () => {
    const fixture = renderMenu(false, false, MERGE_TARGETS);
    const merged = vi.fn();
    fixture.componentInstance.mergeRequested.subscribe(merged);

    expect(textsOf(fixture, '.context-menu-item-merge')).toEqual(['system_cpu_user', 'system_memory_used + system_swap_used']);
    expect(elementsOf(fixture, '.context-menu-item-merge')[0]?.getAttribute('aria-label')).toBe('Merge with system_cpu_user');

    elementsOf(fixture, '.context-menu-item-merge')[1]?.click();

    expect(merged).toHaveBeenCalledWith('s1');
  });

  it('offers no merge when the canvas has no chart to merge into', () => {
    expect(elementOf(renderMenu(false), '.context-menu-item-merge')).toBeNull();
  });

  it('closes on a click or a second right click anywhere else', () => {
    const fixture = renderMenu(true);
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);
    const backdrop = elementOf(fixture, '.context-menu-backdrop');
    const secondRightClick = new MouseEvent('contextmenu', { cancelable: true });

    backdrop?.click();
    backdrop?.dispatchEvent(secondRightClick);

    expect(closed).toHaveBeenCalledTimes(2);
    expect(secondRightClick.defaultPrevented).toBe(true);
  });
});
