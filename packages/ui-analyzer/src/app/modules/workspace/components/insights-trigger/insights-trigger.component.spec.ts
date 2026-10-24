import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { Finding, Severity } from '../../../../stores/insights/models/finding/finding.model';
import type { InsightStatus } from '../../../../stores/insights/models/insights-run/insights-run';
import { InsightsTriggerComponent } from './insights-trigger.component';

const findingOf = (severity: Severity): Finding => ({
  id: `finding-${severity}`,
  severity,
  isInferred: false,
  match: '',
  title: '',
  fromMilliseconds: 0,
  untilMilliseconds: 1,
  cause: [],
  evidence: [],
});

const renderTrigger = (status: InsightStatus, overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(InsightsTriggerComponent, { status, stageIndex: 0, progress: 0, findings: [], isStale: false, isShown: true, ...overrides });

describe('InsightsTriggerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('offers to run insights with its keyboard hint, and asks for a run when clicked', () => {
    const fixture = renderTrigger('idle');
    const requested = vi.fn();
    fixture.componentInstance.runRequested.subscribe(requested);

    expect(textOf(fixture, '.insights-trigger-label')).toBe('Run insights');
    expect(textOf(fixture, '.insights-trigger-key')).toBe('I');

    elementOf(fixture, '.insights-trigger-idle')?.click();

    expect(requested).toHaveBeenCalledTimes(1);
  });

  it('shows the current stage, its step out of three and the progress while running', () => {
    const fixture = renderTrigger('running', { stageIndex: 2, progress: 0.955 });

    expect(textOf(fixture, '.insights-trigger-stage-label')).toBe('Matching rules…');
    expect(textOf(fixture, '.insights-trigger-stage-step')).toBe('3/3');
    expect(elementOf(fixture, '.insights-trigger-fill')?.style.width).toBe('96%');
    expect(elementOf(fixture, '.insights-trigger-idle')).toBeNull();
  });

  it('InsightsTriggerComponent, at a stage past the ones it has names for, shows the stage label without a name', () => {
    const fixture = renderTrigger('running', { stageIndex: 3 });

    expect(textOf(fixture, '.insights-trigger-stage-label')).toBe('…');
  });

  it('offers to cancel a run under way, named for a screen reader as for the mouse', () => {
    const fixture = renderTrigger('running');
    const cancelled = vi.fn();
    fixture.componentInstance.cancelRequested.subscribe(cancelled);
    const cancel = elementOf(fixture, '.insights-trigger-cancel');

    cancel?.click();

    expect(cancel?.getAttribute('aria-label')).toBe('cancel this run (esc)');
    expect(cancel?.title).toBe('cancel this run (esc)');
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it('counts the findings once done and toggles the panel when clicked', () => {
    const fixture = renderTrigger('done', { findings: [findingOf('critical'), findingOf('info')] });
    const toggled = vi.fn();
    fixture.componentInstance.panelToggled.subscribe(toggled);

    expect(textOf(fixture, '.insights-trigger-count')).toBe('2 findings');
    expect(elementOf(fixture, '.insights-trigger-pill')?.title).toBe('toggle insights panel (i)');
    expect(elementOf(fixture, '.insights-trigger-stale-mark')).toBeNull();

    elementOf(fixture, '.insights-trigger-pill')?.click();

    expect(toggled).toHaveBeenCalledTimes(1);
  });

  it('carries a switch that reads on while the findings are shown, off once hidden, and reports each flip', () => {
    const fixture = renderTrigger('done');
    const flipped = vi.fn();
    fixture.componentInstance.shownToggled.subscribe(flipped);
    const toggle = elementOf(fixture, '.insights-trigger-switch');

    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(toggle?.getAttribute('aria-label')).toBe('show or hide the findings');
    expect(toggle?.title).toBe('show or hide the findings');
    expect(elementOf(fixture, '.insights-trigger-chip-shown')).not.toBeNull();

    toggle?.click();
    fixture.componentRef.setInput('isShown', false);
    fixture.detectChanges();

    expect(flipped).toHaveBeenCalledTimes(1);
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
    expect(elementOf(fixture, '.insights-trigger-chip-shown')).toBeNull();
  });

  it('says there are no findings, and marks a stale run with a re-run hint', () => {
    const fixture = renderTrigger('done', { isStale: true });

    expect(textOf(fixture, '.insights-trigger-count')).toBe('no findings');
    expect(elementOf(fixture, '.insights-trigger-pill-stale')).not.toBeNull();
    expect(textOf(fixture, '.insights-trigger-stale-mark')).toBe('↻');
    expect(elementOf(fixture, '.insights-trigger-pill')?.title).toBe('results are stale — open the panel to re-run');
  });
});
