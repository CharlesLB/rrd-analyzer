import { TestBed } from '@angular/core/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { discoverLogFields } from '../../../../stores/logs/models/log-field/log-field';
import { detectMapping, type LogMapping } from '../../../../stores/logs/models/log-mapping/log-mapping';
import { defaultTypeColorsOf } from '../../../../stores/logs/models/log-severity/log-severity';
import { validateMapping } from '../../../../stores/logs/models/log-validation/log-validation';
import { logRecordsFixture } from '../../../../stores/logs/store/logs-store/logs.store.fixture';
import { LogSetupPanelComponent } from './log-setup-panel.component';

const messages = messagesFor();
const RECORDS = logRecordsFixture();
const DISCOVERED = discoverLogFields(RECORDS);
const DETECTED = detectMapping(DISCOVERED);

const validationOf = (mapping: LogMapping) =>
  validateMapping(RECORDS, mapping, { logs: messages.logs, units: messages.units, listSeparator: messages.application.listSeparator });

const renderPanel = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogSetupPanelComponent, {
    status: 'setup',
    file: { name: 'atlas-api-logs.json', sizeBytes: 275072 },
    failure: null,
    notes: [],
    fields: DISCOVERED.fields,
    recordCount: RECORDS.length,
    draftMapping: DETECTED,
    detectedMapping: DETECTED,
    validation: validationOf(DETECTED),
    typeColors: defaultTypeColorsOf(['fatal', 'error', 'warn', 'info']),
    chosenColors: new Map<string, string>(),
    isMappingChanged: true,
    ...inputs,
  });

describe('LogSetupPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('while the file is read, shows its name and that it is being parsed, with no footer', () => {
    const fixture = renderPanel({ status: 'loading', fields: [], recordCount: 0, validation: null });

    expect(textOf(fixture, '.log-setup-panel-step')).toBe('parsing');
    expect(textOf(fixture, '.log-setup-panel-loading-file')).toBe('atlas-api-logs.json');
    expect(textOf(fixture, '.log-setup-panel-loading-text')).toBe('Parsing and looking for fields…');
    expect(elementOf(fixture, '.log-setup-panel-footer')).toBeNull();
  });

  it('for a file that failed, shows the failure and no mapping', () => {
    const fixture = renderPanel({ status: 'failed', failure: { title: 'The file is empty.', detail: '' }, fields: [], validation: null });

    expect(textOf(fixture, '.log-setup-panel-step')).toBe('error');
    expect(textOf(fixture, '.log-setup-failure-title')).toBe('The file is empty.');
    expect(countOf(fixture, '.log-field-row')).toBe(0);
  });

  it('for a parsed file, shows what it holds, the three detected fields and a colour per type', () => {
    const fixture = renderPanel({ notes: ['Entries were read from the “logs” array.'] });

    expect(textOf(fixture, '.log-setup-panel-step')).toBe('fields & colors');
    expect(textOf(fixture, '.log-file-summary-meta')).toBe('268.6 KB · 6 entries · 5 fields');
    expect(textOf(fixture, '.log-setup-panel-note')).toBe('Entries were read from the “logs” array.');
    expect(textsOf(fixture, '.log-field-row-label')).toEqual(['Timestamp', 'Type', 'Message']);
    expect(textsOf(fixture, '.log-field-row-path')).toEqual(['@timestamp', 'lvl', 'event.msg']);
    expect(countOf(fixture, '.log-field-row-detected')).toBe(3);
    expect(textsOf(fixture, '.log-color-row-name')).toEqual(['fatal', 'error', 'warn', 'info']);
    expect(textsOf(fixture, '.log-color-row-count')).toEqual(['1', '2', '1', '2']);
  });

  it('opens one picker at a time, lists every field with a sample, and reports the field picked for that role', () => {
    const fixture = renderPanel();
    const chosen = vi.fn();
    fixture.componentInstance.fieldChosen.subscribe(chosen);
    const [timestamp, type] = elementsOf(fixture, '.log-field-row-trigger');

    timestamp?.click();
    fixture.detectChanges();
    type?.click();
    fixture.detectChanges();

    expect(countOf(fixture, '.log-field-row-options')).toBe(1);
    expect(fixture.componentInstance.isPickerOpen()).toBe(true);
    expect(textsOf(fixture, '.log-field-row-option-path')).toEqual(['@timestamp', 'lvl', 'service', 'event.msg', 'ctx.trace_id']);
    expect(textsOf(fixture, '.log-field-row-option-sample')[2]).toBe('"atlas-api"');

    elementsOf(fixture, '.log-field-row-option')[2]?.click();
    fixture.detectChanges();

    expect(chosen).toHaveBeenCalledWith({ role: 'type', path: 'service' });
    expect(fixture.componentInstance.isPickerOpen()).toBe(false);
  });

  it('closes an open picker when asked from outside', () => {
    const fixture = renderPanel();

    elementOf(fixture, '.log-color-row-swatch')?.click();
    fixture.detectChanges();

    expect(countOf(fixture, '.log-color-row-palette')).toBe(1);

    fixture.componentInstance.closePicker();
    fixture.detectChanges();

    expect(countOf(fixture, '.log-color-row-palette')).toBe(0);
  });

  it('reports a colour picked for a type, a reset of that type, and a reset of every type', () => {
    const fixture = renderPanel({ chosenColors: new Map([['error', '#123456']]) });
    const chosen = vi.fn();
    const reset = vi.fn();
    const allReset = vi.fn();
    fixture.componentInstance.colorChosen.subscribe(chosen);
    fixture.componentInstance.colorReset.subscribe(reset);
    fixture.componentInstance.colorsReset.subscribe(allReset);

    elementsOf(fixture, '.log-color-row-swatch')[0]?.click();
    fixture.detectChanges();
    elementsOf(fixture, '.color-palette-choice')[6]?.click();
    elementOf(fixture, '.log-color-row-reset')?.click();
    elementOf(fixture, '.log-setup-panel-colors-reset')?.click();

    expect(chosen).toHaveBeenCalledWith({ type: 'fatal', color: '#2F9A84' });
    expect(reset).toHaveBeenCalledWith('error');
    expect(allReset).toHaveBeenCalledTimes(1);
  });

  it('on first setup, offers to show the logs, and once they are placed, to apply a changed mapping or be done with an unchanged one', () => {
    expect(textOf(renderPanel(), '.log-setup-panel-confirm')).toBe('Show logs');
    expect(textOf(renderPanel({ status: 'ready', isMappingChanged: true }), '.log-setup-panel-confirm')).toBe('Apply');
    expect(textOf(renderPanel({ status: 'ready', isMappingChanged: false }), '.log-setup-panel-confirm')).toBe('Done');
    expect(textOf(renderPanel({ status: 'ready', isMappingChanged: false }), '.log-setup-panel-hint')).toBe('Color changes apply live.');
  });

  it('while a field blocks, disables the primary button, says why, and hides the colours when the type is the one blocking', () => {
    const mapping = { ...DETECTED, type: '@timestamp' };
    const fixture = renderPanel({ draftMapping: mapping, validation: validationOf(mapping) });

    expect((elementOf(fixture, '.log-setup-panel-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(textOf(fixture, '.log-setup-panel-hint-blocked')).toBe('Map all three fields to continue.');
    expect(countOf(fixture, '.log-color-row')).toBe(0);
    expect(countOf(fixture, '.log-field-row-detected')).toBe(2);
  });

  it('asks to confirm from the primary button, and to close from cancel as from the cross', () => {
    const fixture = renderPanel();
    const confirmed = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);
    fixture.componentInstance.closeRequested.subscribe(closed);

    elementOf(fixture, '.log-setup-panel-confirm')?.click();
    elementOf(fixture, '.log-setup-panel-cancel')?.click();
    elementOf(fixture, '.side-panel-close')?.click();

    expect(elementOf(fixture, '.side-panel-close')?.getAttribute('aria-label')).toBe('close (esc)');
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('passes on a request to remove the logs', () => {
    const fixture = renderPanel();
    const removed = vi.fn();
    fixture.componentInstance.removeRequested.subscribe(removed);

    elementOf(fixture, '.log-file-summary-remove')?.click();

    expect(removed).toHaveBeenCalledTimes(1);
  });
});
