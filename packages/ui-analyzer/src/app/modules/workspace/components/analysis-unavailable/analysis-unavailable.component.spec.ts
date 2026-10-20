import { describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { MissingSource } from '../../../../stores/workspace/models/opening-failure/opening-failure';
import { AnalysisUnavailableComponent } from './analysis-unavailable.component';

const CPU: MissingSource = { name: 'cpu.rrd', path: '/data/cpu.rrd' };
const MEMORY: MissingSource = { name: 'memory.rrd', path: '/data/memory.rrd' };

const renderNotice = (missingSources: readonly MissingSource[]) => renderWithInputs(AnalysisUnavailableComponent, { missingSources });

describe('AnalysisUnavailableComponent', () => {
  it('a notice over files that are gone lists the path of each one and says to put them back', () => {
    const fixture = renderNotice([CPU, MEMORY]);

    expect(textOf(fixture, '.analysis-unavailable-title')).toBe('This analysis could not be opened.');
    expect(textOf(fixture, '.analysis-unavailable-summary')).toBe('2 RRD files it reads are no longer where they were:');
    expect(textsOf(fixture, '.analysis-unavailable-source')).toEqual(['/data/cpu.rrd', '/data/memory.rrd']);
    expect(textOf(fixture, '.analysis-unavailable-hint')).toBe('An analysis keeps the path of each file, not a copy. Put the files back and try again.');
  });

  it('a notice over one file that is gone counts it in the singular', () => {
    const fixture = renderNotice([CPU]);

    expect(textOf(fixture, '.analysis-unavailable-summary')).toBe('1 RRD file it reads is no longer where it was:');
  });

  it('a notice with no file known to be gone lists none and says the files may have changed', () => {
    const fixture = renderNotice([]);

    expect(countOf(fixture, '.analysis-unavailable-sources')).toBe(0);
    expect(textOf(fixture, '.analysis-unavailable-hint')).toBe('Its RRD files may have been changed or become unreadable since the analysis was created.');
  });

  it('the notice is announced as an alert, and its buttons ask to try again and to go back', () => {
    const fixture = renderNotice([CPU]);
    const retryRequested = vi.fn();
    const backRequested = vi.fn();
    fixture.componentInstance.retryRequested.subscribe(retryRequested);
    fixture.componentInstance.backRequested.subscribe(backRequested);

    elementOf(fixture, '.analysis-unavailable-retry')?.click();
    elementOf(fixture, '.analysis-unavailable-back')?.click();

    expect(elementOf(fixture, '.analysis-unavailable')?.getAttribute('role')).toBe('alert');
    expect(retryRequested).toHaveBeenCalledTimes(1);
    expect(backRequested).toHaveBeenCalledTimes(1);
  });
});
