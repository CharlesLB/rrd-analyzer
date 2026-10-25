import { TestBed } from '@angular/core/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LibraryTopBarComponent } from './library-top-bar.component';

describe('LibraryTopBarComponent', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the application beside its mark', () => {
    const fixture = TestBed.createComponent(LibraryTopBarComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.library-top-bar-title')).toBe(messagesFor().application.name);
    expect(elementOf(fixture, '.brand-mark')).not.toBeNull();
  });

  it('offers the theme toggle from the bar', () => {
    const fixture = TestBed.createComponent(LibraryTopBarComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.theme-toggle')).not.toBeNull();
  });
});
