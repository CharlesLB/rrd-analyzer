import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogFileSummaryComponent } from './log-file-summary.component';

describe('LogFileSummaryComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows the file, its size and what was found in it', () => {
    const fixture = renderWithInputs(LogFileSummaryComponent, { fileName: 'atlas-api-logs.json', meta: '268.6 KB · 812 entries · 14 fields' });

    expect(textOf(fixture, '.log-file-summary-badge')).toBe('JSON');
    expect(textOf(fixture, '.log-file-summary-name')).toBe('atlas-api-logs.json');
    expect(textOf(fixture, '.log-file-summary-meta')).toBe('268.6 KB · 812 entries · 14 fields');
  });

  it('badges the file with the format it is read as', () => {
    expect(textOf(renderWithInputs(LogFileSummaryComponent, { fileName: 'export.csv', meta: '' }), '.log-file-summary-badge')).toBe('CSV');
    expect(textOf(renderWithInputs(LogFileSummaryComponent, { fileName: 'server.log', meta: '' }), '.log-file-summary-badge')).toBe('TEXT');
  });

  it('offers to replace the file, and asks for the logs to be removed', () => {
    const fixture = renderWithInputs(LogFileSummaryComponent, { fileName: 'atlas-api-logs.json', meta: '' });
    const removed = vi.fn();
    fixture.componentInstance.removeRequested.subscribe(removed);

    elementOf(fixture, '.log-file-summary-remove')?.click();

    expect(textOf(fixture, '.log-file-summary-replace')).toBe('Replace');
    expect(removed).toHaveBeenCalledTimes(1);
  });
});
