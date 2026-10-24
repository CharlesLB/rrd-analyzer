import { TestBed } from '@angular/core/testing';
import { MILLISECONDS_PER_HOUR, MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsReportDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import {
  analyzerGatewayStub,
  bundleDtoFixture,
  configurationStampDtoFixture,
  insightsReportDtoFixture,
  provideGatewayStub,
} from '../../../../core/gateway/analyzer.gateway.fixture';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { InsightsStore } from './insights.store';

const RUN_MILLISECONDS = 1800;

describe('InsightsStore', () => {
  let gateway: AnalyzerGateway;
  let store: InsightsStore;
  let timeWindow: TimeWindowStore;

  const settle = async (pending: Promise<void>): Promise<void> => {
    await vi.advanceTimersByTimeAsync(RUN_MILLISECONDS);
    await pending;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    gateway = analyzerGatewayStub({ openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(3)) });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway), WorkspaceStore, SeriesDataStore, TimeWindowStore, InsightsStore] });
    store = TestBed.inject(InsightsStore);
    timeWindow = TestBed.inject(TimeWindowStore);
    await TestBed.inject(WorkspaceStore).open('a1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const holdRuns = (): ((report: InsightsReportDto) => void) => {
    const held: { answer: (report: InsightsReportDto) => void } = { answer: () => undefined };

    vi.mocked(gateway.runInsights).mockImplementationOnce(
      async () =>
        await new Promise<InsightsReportDto>((resolve) => {
          held.answer = resolve;
        }),
    );

    return (report) => held.answer(report);
  };

  const holdFailingRun = (): ((error: Error) => void) => {
    const held: { fail: (error: Error) => void } = { fail: () => undefined };

    vi.mocked(gateway.runInsights).mockImplementationOnce(
      async () =>
        await new Promise<InsightsReportDto>((_resolve, reject) => {
          held.fail = reject;
        }),
    );

    return (error) => held.fail(error);
  };

  it('a store that has never run lists no analyzed run, and the focused finding has nothing to expand, collapse or show', () => {
    const workspace = TestBed.inject(WorkspaceStore);
    const canvas = workspace.canvas();

    store.toggleFocused();
    store.collapseFocused();
    store.showFocusedOnChart();
    store.toggleFinding(0);

    expect(store.analyzedRun()).toBeNull();
    expect(store.latestReportFindings()).toEqual([]);
    expect(store.staleReason()).toBeNull();
    expect(store.expanded()).toEqual({});
    expect(store.flashingFindingId()).toBeNull();
    expect(workspace.canvas()).toBe(canvas);
  });

  it('run or rerun while a run is under way leaves that run alone and asks the engine nothing more', async () => {
    const answer = holdRuns();
    const running = store.run();
    await vi.advanceTimersByTimeAsync(400);

    await store.run();
    await store.rerun();
    answer(insightsReportDtoFixture());
    await running;

    expect(gateway.runInsights).toHaveBeenCalledTimes(1);
    expect(store.status()).toBe('done');
  });

  it('a run that fails after it was cancelled says nothing and stays where the cancel left it', async () => {
    const fail = holdFailingRun();
    const running = store.run();
    await vi.advanceTimersByTimeAsync(400);

    store.cancel();
    fail(new Error('aborted'));
    await running;

    expect(store.status()).toBe('idle');
    expect(TestBed.inject(ToastStore).message()).toBeNull();
  });

  it('a run that finds nothing opens the panel with no finding expanded', async () => {
    vi.mocked(gateway.runInsights).mockResolvedValueOnce(insightsReportDtoFixture({ findings: [] }));

    await settle(store.run());

    expect(store.status()).toBe('done');
    expect(store.findings()).toEqual([]);
    expect(store.expanded()).toEqual({});
  });

  it('a run that takes a while shows its stages as it goes, then opens the panel on the first finding expanded the moment the answer arrives', async () => {
    const answer = holdRuns();
    const running = store.run();

    await vi.advanceTimersByTimeAsync(100);

    expect(store.status()).toBe('idle');

    await vi.advanceTimersByTimeAsync(800);

    expect(store.status()).toBe('running');
    expect(store.stageIndex()).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);

    expect(store.stageIndex()).toBe(2);
    expect(store.status()).toBe('running');

    answer(insightsReportDtoFixture());
    await running;

    expect(store.status()).toBe('done');
    expect(store.isPanelOpen()).toBe(true);
    expect(store.findings().map((finding) => finding.severity)).toEqual(['critical', 'warning']);
    expect(store.expanded()).toEqual({ fd0: true });
    expect(store.analyzedRun()).not.toBeNull();
    expect(gateway.runInsights).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'a1', scope: 'all' }), expect.any(AbortSignal));
  });

  it('a run answered at once never shows the staged beat', async () => {
    await store.run();

    expect(store.status()).toBe('done');
    expect(store.progress()).toBe(1);
  });

  it('cancel stops a run under way: the request is aborted, the trigger goes back to where it was, and the late answer is dropped without a toast', async () => {
    const answer = holdRuns();
    const running = store.run();
    await vi.advanceTimersByTimeAsync(400);

    store.cancel();

    const [, cancellation] = vi.mocked(gateway.runInsights).mock.calls[0];
    expect(cancellation.aborted).toBe(true);
    expect(store.status()).toBe('idle');

    answer(insightsReportDtoFixture());
    await running;
    await vi.advanceTimersByTimeAsync(2000);

    expect(store.status()).toBe('idle');
    expect(store.findings()).toEqual([]);
    expect(TestBed.inject(ToastStore).message()).toBeNull();
  });

  it('a run under way is cancelled when another analysis is opened, so the new one is not shown as running nor handed its answer', async () => {
    const answer = holdRuns();
    const running = store.run();
    await vi.advanceTimersByTimeAsync(400);

    await TestBed.inject(WorkspaceStore).open('a2');
    TestBed.tick();

    const [, cancellation] = vi.mocked(gateway.runInsights).mock.calls[0];
    expect(cancellation.aborted).toBe(true);
    expect(store.status()).toBe('idle');

    answer(insightsReportDtoFixture());
    await running;

    expect(store.status()).toBe('idle');
  });

  it('a run under way goes on when the analysis on screen is read again', async () => {
    const answer = holdRuns();
    const running = store.run();
    await vi.advanceTimersByTimeAsync(400);

    await TestBed.inject(WorkspaceStore).open('a1');
    TestBed.tick();
    answer(insightsReportDtoFixture());
    await running;

    expect(store.status()).toBe('done');
  });

  it('a repeated run that is cancelled or fails leaves the report it was to replace on show', async () => {
    await settle(store.run());
    const shown = store.findings();
    holdRuns();
    void store.rerun();
    await vi.advanceTimersByTimeAsync(400);

    store.cancel();

    expect(store.status()).toBe('done');
    expect(store.findings()).toBe(shown);

    vi.mocked(gateway.runInsights).mockRejectedValue(new Error('engine down'));
    await settle(store.rerun());

    expect(store.status()).toBe('done');
    expect(store.findings()).toBe(shown);
  });

  it('a run started again after a cancel reaches the engine afresh', async () => {
    holdRuns();
    void store.run();
    store.cancel();

    await settle(store.run());

    expect(store.status()).toBe('done');
    expect(gateway.runInsights).toHaveBeenCalledTimes(2);
  });

  it('asks the engine again for a repeated run, so an answer the engine holds is never older than its rules, and opens on its first finding as a fresh run does', async () => {
    await settle(store.run());
    store.toggleFinding(1);
    store.closePanel();

    await store.run();

    expect(store.status()).toBe('done');
    expect(store.isPanelOpen()).toBe(true);
    expect(store.expanded()).toEqual({ fd0: true });
    expect(gateway.runInsights).toHaveBeenCalledTimes(2);
  });

  it('goes stale once the rules the run was made under change, and a re-run under the new rules is current again', async () => {
    await settle(store.run());

    await store.checkConfiguration();

    expect(store.staleReason()).toBeNull();

    vi.mocked(gateway.fetchInsightsConfiguration).mockResolvedValue(configurationStampDtoFixture('rules-2'));
    await store.checkConfiguration();

    expect(store.staleReason()).toBe('configuration');
    expect(store.isStale()).toBe(true);

    vi.mocked(gateway.runInsights).mockResolvedValue(
      insightsReportDtoFixture({ analyzed: { ...insightsReportDtoFixture().analyzed, rulesetHash: 'rules-2' } }),
    );
    await settle(store.rerun());

    expect(store.staleReason()).toBeNull();
  });

  it('does not ask after the rules before any run, and keeps the run current when the question fails', async () => {
    await store.checkConfiguration();

    expect(gateway.fetchInsightsConfiguration).not.toHaveBeenCalled();

    await settle(store.run());
    vi.mocked(gateway.fetchInsightsConfiguration).mockRejectedValueOnce(new Error('down'));
    await store.checkConfiguration();

    expect(store.isStale()).toBe(false);
  });

  it('goes stale when a viewport run no longer matches the window, or when the scope changes, until it re-runs', async () => {
    store.chooseScope('viewport');
    await settle(store.run());

    expect(store.isStale()).toBe(false);

    timeWindow.showTrailing(6 * MILLISECONDS_PER_HOUR);

    expect(store.isStale()).toBe(true);

    await settle(store.rerun());

    expect(store.isStale()).toBe(false);
    expect(gateway.runInsights).toHaveBeenCalledTimes(2);

    store.chooseScope('all');

    expect(store.isStale()).toBe(true);
  });

  it('marks the run stale once another analysis opens, and runs that analysis on its own', async () => {
    await settle(store.run());
    await TestBed.inject(WorkspaceStore).open('a2');

    expect(store.isStale()).toBe(true);

    await settle(store.run());

    expect(gateway.runInsights).toHaveBeenLastCalledWith(expect.objectContaining({ analysisId: 'a2' }), expect.any(AbortSignal));
    expect(store.isStale()).toBe(false);
  });

  it('moves the focus within the findings and expands and collapses the focused one', async () => {
    await settle(store.run());

    store.focusNext();
    store.focusNext();

    expect(store.focusIndex()).toBe(1);

    store.toggleFocused();

    expect(store.isFocusedExpanded()).toBe(true);

    store.collapseFocused();

    expect(store.isFocusedExpanded()).toBe(false);

    store.focusPrevious();

    expect(store.focusIndex()).toBe(0);
    expect(store.isFocusedExpanded()).toBe(true);
  });

  it('toggleFinding for an index past the findings changes neither the focus nor what is expanded', async () => {
    await settle(store.run());
    const expanded = store.expanded();

    store.toggleFinding(5);

    expect(store.focusIndex()).toBe(0);
    expect(store.expanded()).toBe(expanded);
  });

  it('showFocusedOnChart frames the focused finding on the chart and flashes its band', async () => {
    await settle(store.run());
    store.focusNext();
    const [, focused] = store.findings();

    store.showFocusedOnChart();

    expect(store.flashingFindingId()).toBe(focused.id);
    expect(timeWindow.window().fromMilliseconds).toBeLessThan(focused.fromMilliseconds);
  });

  it('frames a finding on the chart with padding and flashes its band for 1.1 seconds', async () => {
    await settle(store.run());
    const [finding] = store.findings();

    store.showOnChart(finding);

    expect(timeWindow.window().fromMilliseconds).toBeLessThan(finding.fromMilliseconds);
    expect(timeWindow.hasZoomHistory()).toBe(true);
    expect(store.flashingFindingId()).toBe(finding.id);

    await vi.advanceTimersByTimeAsync(1100);

    expect(store.flashingFindingId()).toBeNull();
  });

  it('toggleOverlays hides the findings from the charts and the export while the panel still lists them, and shows them again', async () => {
    await settle(store.run());

    store.toggleOverlays();

    expect(store.areOverlaysHidden()).toBe(true);
    expect(store.overlaidFindings()).toEqual([]);
    expect(store.findings().length).toBe(2);

    store.toggleOverlays();

    expect(store.overlaidFindings().length).toBe(2);
  });

  it('toggleShown takes the findings off the charts and closes the panel, then puts them back on the charts with the panel still closed', async () => {
    await settle(store.run());

    store.toggleShown();

    expect(store.overlaidFindings()).toEqual([]);
    expect(store.isPanelOpen()).toBe(false);
    expect(store.findings().length).toBe(2);

    store.toggleShown();

    expect(store.overlaidFindings().length).toBe(2);
    expect(store.isPanelOpen()).toBe(false);
  });

  it('a finding hovered when the panel closes no longer dims the others once the panel opens again', async () => {
    await settle(store.run());
    store.hoverFinding('fd0');

    expect(store.hoveredFindingId()).toBe('fd0');

    store.closePanel();
    await store.togglePanel();

    expect(store.isPanelOpen()).toBe(true);
    expect(store.hoveredFindingId()).toBeNull();
  });

  it('showOnChart draws every series its evidence cites on one merged chart, as one step to undo, and leaves a finding without evidence to the framing', async () => {
    const workspace = TestBed.inject(WorkspaceStore);
    await settle(store.run());
    const [critical, warning] = store.findings();

    store.showOnChart(critical);

    expect(workspace.canvas()).toHaveLength(1);
    expect(workspace.canvasSeriesIds()).toEqual(['s2', 's1']);

    store.showOnChart(critical);
    store.showOnChart(warning);

    expect(workspace.canvasSeriesIds()).toEqual(['s2', 's1']);

    workspace.undoCanvas();

    expect(workspace.canvasSeriesIds()).toEqual([]);
  });

  it('showOnChart with the findings hidden shows them again, since the band it flashes must be seen', async () => {
    await settle(store.run());
    const [finding] = store.findings();
    store.toggleOverlays();

    store.showOnChart(finding);

    expect(store.areOverlaysHidden()).toBe(false);
    expect(store.overlaidFindings().length).toBeGreaterThan(0);
  });

  it('a new run with the findings hidden draws the findings it finds', async () => {
    await settle(store.run());
    store.toggleOverlays();

    await settle(store.rerun());

    expect(store.areOverlaysHidden()).toBe(false);
    expect(store.overlaidFindings().length).toBeGreaterThan(0);
  });

  it('jumps to an evidence span padded by at least twenty minutes', async () => {
    await settle(store.run());
    const [finding] = store.findings();
    const gap = finding.evidence[1];

    store.jumpToEvidence({ finding, evidence: gap });

    expect(timeWindow.window()).toEqual({
      fromMilliseconds: gap.fromMilliseconds - 20 * MILLISECONDS_PER_MINUTE,
      untilMilliseconds: gap.untilMilliseconds + 20 * MILLISECONDS_PER_MINUTE,
    });
  });

  it('a run belongs to its analysis: another analysis keeps the stale count but draws, lists and exports none of its findings, and opening the panel there runs insights for it', async () => {
    await settle(store.run());

    expect(store.overlaidFindings().length).toBeGreaterThan(0);

    await TestBed.inject(WorkspaceStore).open('a2');

    expect(store.isStale()).toBe(true);
    expect(store.latestReportFindings()).toHaveLength(2);
    expect(store.findings()).toEqual([]);
    expect(store.overlaidFindings()).toEqual([]);
    expect(store.isPanelOpen()).toBe(false);

    await settle(store.togglePanel());

    expect(gateway.runInsights).toHaveBeenLastCalledWith(expect.objectContaining({ analysisId: 'a2' }), expect.any(AbortSignal));
    expect(store.isPanelOpen()).toBe(true);
    expect(store.findings()).toHaveLength(2);
  });

  it('says so and returns to idle when the engine fails', async () => {
    vi.mocked(gateway.runInsights).mockRejectedValueOnce(new Error('down'));

    await settle(store.run());

    expect(store.status()).toBe('idle');
    expect(TestBed.inject(ToastStore).message()).toBe('insights could not run');
  });
});
