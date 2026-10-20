import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { TimeframePopoverComponent } from './timeframe-popover.component';

const renderPopover = (isCompact = false) => renderWithInputs(TimeframePopoverComponent, { tab: 'quick', leftOffset: 218, isCompact });

describe('TimeframePopoverComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('underlines the active tab and switches to the other one on click', () => {
    const fixture = renderPopover();
    const tabs = elementsOf(fixture, '.timeframe-popover-tab');

    expect(tabs[0]?.classList.contains('timeframe-popover-tab-active')).toBe(true);

    tabs[1]?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.tab()).toBe('absolute');
    expect(tabs[1]?.classList.contains('timeframe-popover-tab-active')).toBe(true);
  });

  it('asks to close when the backdrop is clicked', () => {
    const fixture = renderPopover();
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    elementOf(fixture, '.timeframe-popover-backdrop')?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('pins itself to the viewport on a compact window', () => {
    expect(elementOf(renderPopover(true), '.timeframe-popover-compact')).not.toBeNull();
  });
});
