import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { defaultTypeColorsOf } from '../../../../stores/logs/models/log-severity/log-severity';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { LogTrackComponent } from './log-track.component';

const WINDOW = { fromMilliseconds: 0, untilMilliseconds: 3200 };

const ENTRIES: readonly LogEntry[] = [
  [400, 'info', 'Config reloaded'],
  [1600, 'error', 'Upstream 503 from atlas-store'],
  [1602, 'error', 'Upstream 503 from atlas-store, again'],
  [2400, 'fatal', 'OOMKilled'],
].map(([timeMilliseconds, type, message], index) => ({ index, timeMilliseconds, type, message, record: {} }) as LogEntry);

const TYPES = [
  { name: 'fatal', count: 1 },
  { name: 'error', count: 2 },
  { name: 'info', count: 1 },
];

const renderTrack = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogTrackComponent, {
    status: 'ready',
    fileName: 'atlas-api-logs.json',
    failureTitle: '',
    recordCount: 4,
    isSetupOpen: false,
    entries: ENTRIES,
    types: TYPES,
    typeColors: defaultTypeColorsOf(['fatal', 'error', 'info']),
    hiddenTypes: new Set<string>(),
    span: { fromMilliseconds: 400, untilMilliseconds: 2400 },
    window: WINDOW,
    bounds: { fromMilliseconds: -10_000, untilMilliseconds: 3200 },
    cursorFraction: null,
    marks: [],
    selectedIndex: null,
    isSingleLane: false,
    ...inputs,
  });

const markerLabels = (fixture: ReturnType<typeof renderTrack>): readonly (string | null)[] =>
  elementsOf(fixture, '.log-track-marker').map((marker) => marker.getAttribute('aria-label'));

describe('LogTrackComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('heads the track with the file, one chip per type and how many entries are in view', () => {
    const fixture = renderTrack();

    expect(textOf(fixture, '.log-track-caption')).toBe('Logs');
    expect(textOf(fixture, '.log-track-file')).toBe('atlas-api-logs.json');
    expect(textsOf(fixture, '.log-type-chips-chip-name')).toEqual(['fatal', 'error', 'info']);
    expect(textOf(fixture, '.log-track-in-view')).toBe('4 in view');
  });

  it('draws one lane per type, most severe on top, with a marker where each entry falls and one marker for entries that share a slot', () => {
    const fixture = renderTrack();
    const lanes = elementsOf(fixture, '.log-track-lane');

    expect(lanes.map((lane) => lane.title)).toEqual(['fatal', 'error', 'info']);
    expect(lanes.map((lane) => lane.querySelectorAll('.log-track-marker').length)).toEqual([1, 1, 1]);
    expect(elementOf(fixture, '.log-track-lane[title="info"] .log-track-marker')?.style.left).toBe('12.5%');
    expect(countOf(fixture, '.log-track-marker-grouped')).toBe(1);
    expect(lanes[0]?.style.getPropertyValue('--type-color')).toBe(LOG_TYPE_COLORS.fatal);
  });

  it('sets a hidden scrollbar-wide spacer beside the lanes, so they end where the plots above a scrolling canvas end', () => {
    const plot = elementOf(renderTrack(), '.log-track-plot');

    expect(Array.from(plot?.children ?? []).map((child) => child.className)).toEqual(['log-track-lanes', 'log-track-gutter']);
  });

  it('names each marker for a screen reader by its type and its time', () => {
    expect(markerLabels(renderTrack())[0]).toMatch(/^fatal \d{4}-\d{2}-\d{2} \d{2}:\d{2}:02$/);
  });

  it('on a single row, puts every type on one lane', () => {
    const fixture = renderTrack({ isSingleLane: true });

    expect(elementsOf(fixture, '.log-track-lane').map((lane) => lane.title)).toEqual(['all types']);
    expect(countOf(fixture, '.log-track-lane-plain')).toBe(1);
    expect(countOf(fixture, '.log-track-marker')).toBe(3);
  });

  it('shows the entry under the pointer in a tooltip, says how many more share its marker, and reports the hover', () => {
    const fixture = renderTrack();
    const hovered = vi.fn();
    fixture.componentInstance.entryHovered.subscribe(hovered);
    const grouped = elementOf(fixture, '.log-track-marker-grouped');

    grouped?.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();

    expect(textOf(fixture, '.log-track-tip-type')).toBe('error');
    expect(textOf(fixture, '.log-track-tip-message')).toBe('Upstream 503 from atlas-store');
    expect(textOf(fixture, '.log-track-tip-more')).toBe('+1 more here · click, then step with ‹ ›');
    expect(grouped?.classList.contains('log-track-marker-raised')).toBe(true);

    grouped?.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();

    expect(elementOf(fixture, '.log-track-tip')).toBeNull();
    expect(hovered.mock.calls).toEqual([[1], [null]]);
  });

  it('when the window moves under a focused marker, reports the entry the marker now stands for, the one its tooltip names', () => {
    const entries = [
      { index: 0, timeMilliseconds: 400, type: 'info', message: 'Config reloaded', record: {} },
      { index: 1, timeMilliseconds: 2000, type: 'info', message: 'Cache warmed', record: {} },
    ];

    const fixture = renderTrack({ entries, types: [{ name: 'info', count: 2 }] });
    const hovered = vi.fn();
    fixture.componentInstance.entryHovered.subscribe(hovered);

    elementOf(fixture, '.log-track-marker')?.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    fixture.componentRef.setInput('window', { fromMilliseconds: 1600, untilMilliseconds: 4800 });
    fixture.detectChanges();

    expect(textOf(fixture, '.log-track-tip-message')).toBe('Cache warmed');
    expect(hovered).toHaveBeenLastCalledWith(1);
  });

  it('asks for the lead entry of a clicked marker, and for the selected entry again when its own marker is clicked', () => {
    const fixture = renderTrack({ selectedIndex: 2 });
    const selected = vi.fn();
    fixture.componentInstance.entrySelected.subscribe(selected);

    elementOf(fixture, '.log-track-marker-selected')?.click();
    elementOf(fixture, '.log-track-lane[title="fatal"] .log-track-marker')?.click();

    expect(countOf(fixture, '.log-track-marker-selected')).toBe(1);
    expect(selected.mock.calls).toEqual([[2], [3]]);
  });

  it('mirrors the chart cursor and draws the hovered and selected entries as lines across the lanes', () => {
    const fixture = renderTrack({
      cursorFraction: 0.25,
      marks: [
        { fraction: 0.5, x: 500, color: LOG_TYPE_COLORS.error, isSelected: false },
        { fraction: 0.75, x: 750, color: LOG_TYPE_COLORS.fatal, isSelected: true },
      ],
    });

    expect(elementOf(fixture, '.log-track-cursor')?.style.left).toBe('25%');
    expect(elementsOf(fixture, '.log-track-mark').map((mark) => mark.style.left)).toEqual(['50%', '75%']);
    expect(countOf(fixture, '.log-track-mark-selected')).toBe(1);
  });

  it('leaves a hidden type out of the lanes, and offers to show all once every type is hidden', () => {
    const partly = renderTrack({ hiddenTypes: new Set(['info']) });
    const fully = renderTrack({ hiddenTypes: new Set(['fatal', 'error', 'info']) });
    const shownAll = vi.fn();
    fully.componentInstance.allTypesShown.subscribe(shownAll);

    expect(elementsOf(partly, '.log-track-lane').map((lane) => lane.title)).toEqual(['fatal', 'error']);
    expect(textOf(partly, '.log-track-in-view')).toBe('3 in view');
    expect(textOf(fully, '.log-track-notice-text')).toBe('All log types are hidden.');

    elementOf(fully, '.log-track-notice-action')?.click();

    expect(shownAll).toHaveBeenCalledTimes(1);
  });

  it('with no entry in the window, says where the logs are and asks to jump there', () => {
    const fixture = renderTrack({ window: { fromMilliseconds: -5000, untilMilliseconds: -1000 } });
    const jumped = vi.fn();
    fixture.componentInstance.jumpRequested.subscribe(jumped);

    expect(textOf(fixture, '.log-track-notice-text')).toBe('No log entries in this window.');
    expect(textOf(fixture, '.log-track-notice-detail')).toContain('Logs span');
    expect(elementOf(fixture, '.log-track-lanes')).toBeNull();

    elementOf(fixture, '.log-track-notice-action')?.click();

    expect(jumped).toHaveBeenCalledTimes(1);
  });

  it('for a file that failed, says why in the failure colour and offers the details', () => {
    const fixture = renderTrack({ status: 'failed', fileName: 'broken-export.json', failureTitle: 'The file is empty.', entries: [], types: [], span: null });
    const setup = vi.fn();
    fixture.componentInstance.setupRequested.subscribe(setup);

    expect(textOf(fixture, '.log-track-notice-failure .log-track-notice-text')).toBe("Couldn't load broken-export.json — The file is empty.");
    expect(elementOf(fixture, '.log-track-file')).toBeNull();
    expect(elementOf(fixture, '.log-track-setup')).toBeNull();

    elementOf(fixture, '.log-track-notice-action')?.click();

    expect(setup).toHaveBeenCalledTimes(1);
  });

  it('asks for the setup from the fields and colours button, and for a type to be toggled from its chip', () => {
    const fixture = renderTrack();
    const setup = vi.fn();
    const toggled = vi.fn();
    fixture.componentInstance.setupRequested.subscribe(setup);
    fixture.componentInstance.typeToggled.subscribe(toggled);

    elementOf(fixture, '.log-track-setup')?.click();
    elementsOf(fixture, '.log-type-chips-chip')[1]?.click();

    expect(setup).toHaveBeenCalledTimes(1);
    expect(toggled).toHaveBeenCalledWith('error');
  });
});
