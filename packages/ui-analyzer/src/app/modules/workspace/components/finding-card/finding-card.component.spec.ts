import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERIES_COLORS } from '../../../../shared/constants/colors';
import { countOf, elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { Finding } from '../../../../stores/insights/models/finding/finding.model';
import { FindingCardComponent } from './finding-card.component';

const FINDING: Finding = {
  id: 'fd0',
  severity: 'critical',
  isInferred: true,
  match: 'evidence order matches rule',
  title: 'Process likely went down out of memory',
  fromMilliseconds: new Date(2026, 7, 18, 2, 20).getTime(),
  untilMilliseconds: new Date(2026, 7, 18, 9, 15).getTime(),
  cause: [
    { text: 'Heap objects and resident memory climbed for ', isEmphasized: false },
    { text: '3.1 h', isEmphasized: true },
  ],
  evidence: [
    {
      semantic: 'heap.objects',
      seriesId: 's2',
      source: 'atlas_runtime_heap_objects.rrd',
      direction: 'rising',
      fromMilliseconds: new Date(2026, 7, 18, 2, 20).getTime(),
      untilMilliseconds: new Date(2026, 7, 18, 5, 20).getTime(),
      fromValue: 1,
      toValue: 2,
      unit: '',
      spark: [1, 2],
    },
  ],
};

const renderCard = (isOpen: boolean, isFocused = false) =>
  renderWithInputs(FindingCardComponent, { finding: FINDING, isOpen, isFocused, plottedColors: new Map([['s5', SERIES_COLORS[5]]]) });

describe('FindingCardComponent', () => {
  const scrolledIntoView = vi.fn();

  beforeEach(() => {
    TestBed.configureTestingModule({});
    scrolledIntoView.mockClear();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { value: scrolledIntoView, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('a card taking the focus scrolls into view by the least it can, and one without it stays where it is', () => {
    renderCard(false);
    TestBed.tick();

    expect(scrolledIntoView).not.toHaveBeenCalled();

    renderCard(false, true);
    TestBed.tick();

    expect(scrolledIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('summarises severity, the inferred mark, the interval, the title, the evidence count and the match', () => {
    const fixture = renderCard(false, true);

    expect(textOf(fixture, '.finding-card-severity')).toBe('CRITICAL');
    expect(elementOf(fixture, '.finding-card-inferred')?.getAttribute('title')).toContain('not observed');
    expect(textOf(fixture, '.finding-card-interval')).toBe('18/08 02:20 – 18/08 09:15');
    expect(textOf(fixture, '.finding-card-title')).toBe('Process likely went down out of memory');
    expect(textOf(fixture, '.finding-card-disclosure')).toBe('▸ 1 evidence');
    expect(textOf(fixture, '.finding-card-match')).toBe('evidence order matches rule');
    expect(elementOf(fixture, '.finding-card-focused')).not.toBeNull();
    expect(elementOf(fixture, '.finding-card-detail')).toBeNull();
  });

  it('opens on the cause with its numbers set apart, the evidence and the show-on-chart action', () => {
    const fixture = renderCard(true);

    expect(textOf(fixture, '.finding-card-disclosure')).toBe('▾ 1 evidence');
    expect(textOf(fixture, '.finding-card-number')).toBe('3.1 h');
    expect(countOf(fixture, 'app-evidence-chip')).toBe(1);
    expect(textOf(fixture, '.finding-card-show')).toBe('Show on chart');
  });

  it('toggles from the summary, and shows on chart without toggling', () => {
    const fixture = renderCard(true);
    const toggled = vi.fn();
    const shown = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    fixture.componentInstance.showOnChartRequested.subscribe(shown);

    elementOf(fixture, '.finding-card-show')?.click();
    elementOf(fixture, '.finding-card-detail')?.click();
    elementOf(fixture, '.finding-card-summary')?.click();

    expect(shown).toHaveBeenCalledTimes(1);
    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('lets clicks inside an open finding reach the page, so a menu open elsewhere still closes', () => {
    const fixture = renderCard(true);
    const reachedPage = vi.fn();
    document.addEventListener('click', reachedPage);

    elementOf(fixture, '.finding-card-cause')?.click();
    elementOf(fixture, '.finding-card-show')?.click();
    elementOf(fixture, '.evidence-chip')?.click();
    document.removeEventListener('click', reachedPage);

    expect(reachedPage).toHaveBeenCalledTimes(3);
  });

  it('FindingCardComponent, compiled again from its own metadata as a TestBed override compiles it, still scrolls the focused card into view', async () => {
    TestBed.overrideComponent(FindingCardComponent, { set: {} });
    await TestBed.compileComponents();

    renderCard(false, true);
    TestBed.tick();

    expect(scrolledIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });
});
