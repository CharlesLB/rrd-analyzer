import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_NAME_ERRORS, analysisNameDraftOf, analysisNameDraftSchema, renamedTo } from './analysis-name-draft';

const nameFormOf = (name: string) => form(signal(analysisNameDraftOf(name)), analysisNameDraftSchema, { injector: TestBed.inject(Injector) });

describe('analysisNameDraftSchema', () => {
  it('analysisNameDraftSchema refuses a name of only spaces as blank', () => {
    const nameForm = nameFormOf('   ');

    expect(nameForm.name().valid()).toBe(false);
    expect(
      nameForm
        .name()
        .errors()
        .map((error) => error.kind),
    ).toEqual([ANALYSIS_NAME_ERRORS.BLANK]);
  });

  it('analysisNameDraftSchema accepts any name with a visible character', () => {
    expect(nameFormOf(' a ').name().valid()).toBe(true);
  });
});

describe('renamedTo', () => {
  it('renamedTo answers the typed name without its padding when it differs from the current one', () => {
    expect(renamedTo(analysisNameDraftOf('  Atlas prod  '), 'Capacity')).toBe('Atlas prod');
  });

  it('renamedTo answers null when the typed name, once trimmed, is the current one', () => {
    expect(renamedTo(analysisNameDraftOf(' Capacity '), 'Capacity')).toBeNull();
  });
});
