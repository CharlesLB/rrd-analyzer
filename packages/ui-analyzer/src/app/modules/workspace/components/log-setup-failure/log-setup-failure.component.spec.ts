import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogSetupFailureComponent } from './log-setup-failure.component';

const FAILURE = { title: "This file isn't valid JSON near line 2.", detail: "Expected ',' or '}' after property value in JSON at position 94" };

describe('LogSetupFailureComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('says what went wrong with which file, quotes the parser, and reminds which shapes are accepted', () => {
    const fixture = renderWithInputs(LogSetupFailureComponent, { failure: FAILURE, fileName: 'broken-export.json' });

    expect(elementOf(fixture, '.log-setup-failure-card')?.getAttribute('role')).toBe('alert');
    expect(textOf(fixture, '.log-setup-failure-title')).toBe("This file isn't valid JSON near line 2.");
    expect(textOf(fixture, '.log-setup-failure-file')).toBe('broken-export.json');
    expect(textOf(fixture, '.log-setup-failure-detail')).toContain('at position 94');
    expect(textOf(fixture, '.log-setup-failure-help')).toContain('a CSV with a header row');
  });

  it('for a failure with nothing more to say, shows no detail line, and still offers another file', () => {
    const fixture = renderWithInputs(LogSetupFailureComponent, { failure: { title: 'The file is empty.', detail: '' }, fileName: 'empty.json' });

    expect(elementOf(fixture, '.log-setup-failure-detail')).toBeNull();
    expect(textOf(fixture, '.log-setup-failure-another')).toBe('Choose another file');
  });
});
