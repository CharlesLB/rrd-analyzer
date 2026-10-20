import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { timestampRangeOf } from '../../../../stores/workspace/models/timeframe/timeframe';
import { TimeframeEditorComponent } from './timeframe-editor.component';

const WINDOW = { fromMilliseconds: new Date(2026, 7, 28, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() };
const BOUNDS = { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: WINDOW.untilMilliseconds };

const renderEditor = (tab = 'quick') =>
  renderWithInputs(TimeframeEditorComponent, {
    tab,
    quickCount: '24',
    quickUnit: 'hours',
    window: WINDOW,
    bounds: BOUNDS,
    activePresetKey: 'last24Hours',
    leftOffset: 218,
    isCompact: false,
  });

const inputValues = (fixture: ReturnType<typeof renderEditor>): readonly string[] =>
  elementsOf(fixture, '.absolute-range-input').map((element) => (element instanceof HTMLInputElement ? element.value : ''));

describe('TimeframeEditorComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('opens on the quick tab and reports its apply and a preset choice', () => {
    const fixture = renderEditor();
    const applied = vi.fn();
    const chosen = vi.fn();
    fixture.componentInstance.trailingCountApplied.subscribe(applied);
    fixture.componentInstance.presetChosen.subscribe(chosen);

    elementOf(fixture, '.quick-select-apply')?.click();
    elementsOf(fixture, '.quick-select-preset')[0]?.click();

    expect(elementOf(fixture, 'app-absolute-range')).toBeNull();
    expect(applied).toHaveBeenCalledTimes(1);
    expect(chosen).toHaveBeenCalledWith(900_000);
  });

  it('fills the absolute tab with the window it opened on', () => {
    const fixture = renderEditor('absolute');
    const { from, to } = timestampRangeOf(WINDOW);

    expect(inputValues(fixture)).toEqual([from, to]);
  });

  it('applies what was typed on the absolute tab', () => {
    const fixture = renderEditor('absolute');
    const applied = vi.fn();
    fixture.componentInstance.absoluteApplied.subscribe(applied);

    typeInto(fixture, '.absolute-range-input', '2026-08-01 00:00');
    elementOf(fixture, '.absolute-range-apply')?.click();

    expect(applied).toHaveBeenCalledWith({ from: '2026-08-01 00:00', to: timestampRangeOf(WINDOW).to });
  });

  it('asks to close when the popover backdrop is clicked', () => {
    const fixture = renderEditor();
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    elementOf(fixture, '.timeframe-popover-backdrop')?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('Escape in a field of either tab asks to close the popover', () => {
    const closed = vi.fn();
    const quick = renderEditor();
    const absolute = renderEditor('absolute');
    quick.componentInstance.closeRequested.subscribe(closed);
    absolute.componentInstance.closeRequested.subscribe(closed);

    elementOf(quick, '.quick-select-count')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    elementOf(absolute, '.absolute-range-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toHaveBeenCalledTimes(2);
  });
});
