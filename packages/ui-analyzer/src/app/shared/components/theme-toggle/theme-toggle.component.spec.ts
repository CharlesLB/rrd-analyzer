import { TestBed } from '@angular/core/testing';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { ThemeToggleComponent } from './theme-toggle.component';

describe('ThemeToggleComponent', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands every click to the theme store, starting from light', () => {
    const fixture = TestBed.createComponent(ThemeToggleComponent);
    const themes = TestBed.inject(ThemeStore);
    fixture.detectChanges();

    const button = elementOf(fixture, '.theme-toggle');
    button?.click();

    expect(themes.theme()).toBe('dark');

    button?.click();

    expect(themes.theme()).toBe('light');
  });
});
