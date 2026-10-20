import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { CPU_USER_SERIES, MEMORY_USED_SERIES, seriesFixture } from '../../../../stores/workspace/models/series/series.fixture';
import type { SeriesMenuRow } from '../../../../stores/workspace/models/series-menu/series-menu';
import { ChartSeriesMenuComponent } from './chart-series-menu.component';

const SYSTEM_SERIES = seriesFixture(4, { name: 'atlas_system_cpu_system', unit: '%' });

const ROWS: readonly SeriesMenuRow[] = [
  {
    series: CPU_USER_SERIES,
    axis: 0,
    choices: [
      { axis: 0, isNew: false },
      { axis: 2, isNew: true },
    ],
  },
  { series: MEMORY_USED_SERIES, axis: 1, choices: [{ axis: 1, isNew: false }] },
  {
    series: SYSTEM_SERIES,
    axis: 0,
    choices: [
      { axis: 0, isNew: false },
      { axis: 2, isNew: true },
    ],
  },
];

const renderMenu = () => renderWithInputs(ChartSeriesMenuComponent, { rows: ROWS, placement: { top: 100, bottom: null, right: 40 } });

describe('ChartSeriesMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('lists every series of the chart with its unit and the axis it is read against, anchored where it was placed', () => {
    const fixture = renderMenu();

    expect(textsOf(fixture, '.chart-series-menu-name')).toEqual(['atlas_system_cpu_user', 'atlas_system_memory_used', 'atlas_system_cpu_system']);
    expect(textsOf(fixture, '.chart-series-menu-unit')).toEqual(['%', 'B', '%']);
    expect(textsOf(fixture, '.option-select-trigger')).toEqual(['Axis 1▾', 'Axis 2▾', 'Axis 1▾']);
    expect(elementOf(fixture, '.anchored-menu')?.style.top).toBe('100px');
    expect(elementOf(fixture, '.anchored-menu')?.style.right).toBe('40px');
  });

  it('offers the axes a series may move to, a new one included, and names the series and axis chosen', () => {
    const fixture = renderMenu();
    const chosen = vi.fn();
    fixture.componentInstance.axisChosen.subscribe(chosen);

    elementsOf(fixture, '.option-select-trigger')[2]?.click();
    fixture.detectChanges();

    expect(textsOf(fixture, '.option-menu-item')).toEqual([expect.stringContaining('Axis 1'), expect.stringContaining('New axis')]);

    elementsOf(fixture, '.option-menu-item')[1]?.click();

    expect(chosen).toHaveBeenCalledWith({ seriesId: 's4', axis: 2 });
  });

  it('offers to separate the chart into as many charts as it draws series, and closes from its backdrop', () => {
    const fixture = renderMenu();
    const separated = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.separateRequested.subscribe(separated);
    fixture.componentInstance.closeRequested.subscribe(closed);

    expect(textOf(fixture, '.chart-series-menu-separate')).toBe('Separate into 3 charts');

    elementOf(fixture, '.chart-series-menu-separate')?.click();
    elementOf(fixture, '.anchored-menu-backdrop')?.click();

    expect(separated).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
