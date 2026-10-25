import { TestBed } from '@angular/core/testing';
import { stubBrowserStorage } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { TimeframeBarComponent } from './timeframe-bar.component';

const renderBar = () => renderWithInputs(TimeframeBarComponent, {});

describe('TimeframeBarComponent', () => {
  beforeEach(() => {
    stubBrowserStorage();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks to go back to the menu from its ‹, named for a reader that cannot see the glyph', () => {
    const fixture = renderBar();
    const reported = vi.fn();
    fixture.componentInstance.backRequested.subscribe(reported);

    elementOf(fixture, '.timeframe-bar-back')?.click();

    expect(reported).toHaveBeenCalledTimes(1);
    expect(elementOf(fixture, '.timeframe-bar-back')?.getAttribute('aria-label')).toBe('back to menu');
  });

  it('carries no zoom control and no duration of its own', () => {
    const fixture = renderBar();

    expect(elementOf(fixture, '.timeframe-bar-zoom')).toBeNull();
    expect(elementOf(fixture, '.timeframe-bar-duration')).toBeNull();
  });
});
