import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LogsTriggerComponent } from './logs-trigger.component';

const renderTrigger = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(LogsTriggerComponent, { hasFile: true, isShown: true, entryCount: 16736, isCompact: false, ...inputs });

describe('LogsTriggerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('before any file is loaded, offers a single button that adds logs', () => {
    const fixture = renderTrigger({ hasFile: false, entryCount: null });

    expect(textOf(fixture, '.logs-trigger-add')).toBe('+Add logs');
    expect(elementOf(fixture, '.logs-trigger-add')?.getAttribute('aria-label')).toBe('Add logs');
    expect(elementOf(fixture, '.logs-trigger-switch')).toBeNull();
  });

  it('with a file loaded, becomes a switch that shows the entry count beside a button that removes the logs', () => {
    const fixture = renderTrigger();
    const toggled = vi.fn();
    const removed = vi.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    fixture.componentInstance.removeRequested.subscribe(removed);

    expect(elementOf(fixture, '.logs-trigger-add')).toBeNull();
    expect(textOf(fixture, '.logs-trigger-count')).toBe('16,736');
    expect(elementOf(fixture, '.logs-trigger-switch')?.getAttribute('aria-checked')).toBe('true');
    expect(elementOf(fixture, '.logs-trigger-remove')?.getAttribute('aria-label')).toBe('remove logs');

    elementOf(fixture, '.logs-trigger-switch')?.click();
    elementOf(fixture, '.logs-trigger-remove')?.click();

    expect(toggled).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledTimes(1);
  });

  it('with the logs hidden, turns the switch off, and shows no count until the entries are on the timeline', () => {
    const fixture = renderTrigger({ isShown: false, entryCount: null });

    expect(elementOf(fixture, '.logs-trigger-switch')?.getAttribute('aria-checked')).toBe('false');
    expect(elementOf(fixture, '.logs-trigger-shown')).toBeNull();
    expect(elementOf(fixture, '.logs-trigger-count')).toBeNull();
  });

  it('on a narrow screen, keeps the add button to its glyph', () => {
    expect(textOf(renderTrigger({ hasFile: false, isCompact: true }), '.logs-trigger-add')).toBe('+');
  });
});
