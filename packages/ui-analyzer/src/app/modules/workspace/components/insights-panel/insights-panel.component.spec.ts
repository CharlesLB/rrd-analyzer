import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import type { Finding } from '../../../../stores/insights/models/finding/finding.model';
import { InsightsPanelComponent } from './insights-panel.component';

const finding = (id: string, severity: Finding['severity']): Finding => ({
  id,
  severity,
  isInferred: false,
  match: 'slow trend — informational',
  title: 'p95 latency trending upward',
  fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(),
  untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime(),
  cause: [],
  evidence: [],
});

const renderPanel = (overrides: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(InsightsPanelComponent, {
    findings: [finding('fd0', 'critical'), finding('fd1', 'info')],
    focusIndex: 0,
    expanded: {},
    scope: 'all',
    staleReason: null,
    analyzedRun: {
      ranAtMilliseconds: new Date(2026, 8, 13, 23, 47, 55).getTime(),
      scope: 'all',
      window: { fromMilliseconds: new Date(2026, 6, 30, 15, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() },
      unclassifiedLabels: ['runtime_goroutines'],
    },
    plottedColors: new Map(),
    ...overrides,
  });

describe('InsightsPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('heads the ranked findings with the scope, when it ran, and the unclassified note after the findings', () => {
    const fixture = renderPanel();

    expect(textOf(fixture, '.insights-panel-count')).toBe('2 ranked');
    expect(textOf(fixture, '.insights-panel-beta')).toBe('beta');
    expect(textOf(fixture, '.insights-panel-scope .option-select-trigger')).toContain('all data');
    expect(textOf(fixture, '.insights-panel-ran')).toBe('ran 23:47:55');
    expect(countOf(fixture, 'app-finding-card')).toBe(2);
    expect(textOf(fixture, '.insights-panel-list > :last-child')).toBe(
      "1 series wasn't recognized as CPU/memory/disk/network (runtime_goroutines). Classification is keyword-based.",
    );
  });

  it('offers to hide the findings on the charts, then to show them again, and reports each toggle', () => {
    const fixture = renderPanel();
    const toggled = vi.fn();
    fixture.componentInstance.overlaysToggled.subscribe(toggled);

    expect(textOf(fixture, '.insights-panel-overlays')).toBe('hide');

    elementOf(fixture, '.insights-panel-overlays')?.click();
    fixture.componentRef.setInput('areOverlaysHidden', true);
    fixture.detectChanges();

    expect(toggled).toHaveBeenCalledTimes(1);
    expect(textOf(fixture, '.insights-panel-overlays-hidden')).toBe('show');
  });

  it('offers no toggle when a run found nothing to draw', () => {
    const fixture = renderPanel({ findings: [] });

    expect(elementOf(fixture, '.insights-panel-overlays')).toBeNull();
  });

  it('warns when the run is stale and re-runs from the banner', () => {
    const fixture = renderPanel({ staleReason: 'view' });
    const rerun = vi.fn();
    fixture.componentInstance.rerunRequested.subscribe(rerun);

    expect(textOf(fixture, '.insights-panel-stale-text')).toBe('Stale — the window or scope changed since this run.');

    elementOf(fixture, '.insights-panel-stale-rerun')?.click();

    expect(rerun).toHaveBeenCalledTimes(1);
  });

  it('says the rules changed when that is why the run is stale', () => {
    const fixture = renderPanel({ staleReason: 'configuration' });

    expect(textOf(fixture, '.insights-panel-stale-text')).toBe('Stale — the insight rules changed since this run.');
  });

  it('lists the scopes with a check on the current one and reports the choice', () => {
    const fixture = renderPanel();
    const chosen = vi.fn();
    fixture.componentInstance.scopeChosen.subscribe(chosen);

    elementOf(fixture, '.option-select-trigger')?.click();
    fixture.detectChanges();
    elementsOf(fixture, '.option-menu-item')[1]?.click();

    expect(textOf(fixture, '.option-menu-item-selected')).toContain('all data');
    expect(chosen).toHaveBeenCalledWith('viewport');
  });

  it('says no issues were found, and over what, when a run finds nothing', () => {
    const fixture = renderPanel({
      findings: [],
      analyzedRun: {
        ranAtMilliseconds: new Date(2026, 8, 13, 23, 47, 55).getTime(),
        scope: 'viewport',
        window: { fromMilliseconds: new Date(2026, 7, 29, 14, 0).getTime(), untilMilliseconds: new Date(2026, 7, 29, 15, 0).getTime() },
        unclassifiedLabels: [],
      },
    });

    expect(textOf(fixture, '.insights-panel-count')).toBe('');
    expect(textOf(fixture, '.insights-panel-empty')).toContain('No issues found.');
    expect(textOf(fixture, '.insights-panel-empty')).toContain('Analyzed the viewport — 2026-08-29 14:00 to 2026-08-29 15:00');
  });
});
