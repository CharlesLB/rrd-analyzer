import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ShareTriggerComponent } from './share-trigger.component';

const renderTrigger = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ShareTriggerComponent, { minutesLeft: null, isBusy: false, isCompact: false, ...inputs });

describe('ShareTriggerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('for an analysis not shared, offers to share it live and asks for it when clicked', () => {
    const fixture = renderTrigger();
    const requested = vi.fn();
    fixture.componentInstance.requested.subscribe(requested);

    elementOf(fixture, '.share-trigger')?.click();

    expect(textOf(fixture, '.share-trigger')).toBe('↗Share live');
    expect(elementOf(fixture, '.share-trigger')?.getAttribute('aria-label')).toBe('Share live');
    expect(elementOf(fixture, '.share-trigger-live')).toBeNull();
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('while the link is being created, cannot be clicked again and says it is busy', () => {
    const button = elementOf(renderTrigger({ isBusy: true }), '.share-trigger');

    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(button?.getAttribute('aria-busy')).toBe('true');
  });

  it('on a narrow screen, keeps the share button to its glyph', () => {
    expect(textOf(renderTrigger({ isCompact: true }), '.share-trigger')).toBe('↗');
  });

  it('for an analysis shared live, says so with the minutes left, names them for a screen reader, and opens the panel when clicked', () => {
    const fixture = renderTrigger({ minutesLeft: 42 });
    const requested = vi.fn();
    fixture.componentInstance.requested.subscribe(requested);

    elementOf(fixture, '.share-trigger-live')?.click();

    expect(textOf(fixture, '.share-trigger-label')).toBe('Online · 42 min');
    expect(elementOf(fixture, '.share-trigger-live')?.getAttribute('aria-label')).toBe('shared live · erased 42 minutes after the last activity');
    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('for an analysis shared live with a minute left, speaks of one minute', () => {
    expect(elementOf(renderTrigger({ minutesLeft: 1 }), '.share-trigger-live')?.getAttribute('title')).toBe(
      'shared live · erased 1 minute after the last activity',
    );
  });

  it('for an analysis shared live on a narrow screen, only says it is live', () => {
    expect(textOf(renderTrigger({ minutesLeft: 42, isCompact: true }), '.share-trigger-label')).toBe('Live');
  });
});
