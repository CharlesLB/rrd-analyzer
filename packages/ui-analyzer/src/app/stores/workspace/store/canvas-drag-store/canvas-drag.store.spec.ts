import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartsDtoFixture } from '../../../../core/gateway/analyzer.gateway.fixture';
import type { ToastStore } from '../../../toast/store/toast-store/toast.store';
import type { Canvas } from '../../models/plotted-chart/plotted-chart';
import { chartIdsOf } from '../../models/plotted-chart/plotted-chart';
import { canvasFixture, chartFixture } from '../../models/plotted-chart/plotted-chart.fixture';
import type { WorkspaceStore } from '../workspace-store/workspace.store';
import { openWorkspace } from '../workspace-store/workspace.store.fixture';
import type { CanvasDragStore } from './canvas-drag.store';

describe('CanvasDragStore', () => {
  let workspace: WorkspaceStore;
  let canvasDrag: CanvasDragStore;
  let toasts: ToastStore;

  const chartIds = (): readonly string[] => chartIdsOf(workspace.canvas());

  const configure = async () => {
    ({ workspace, canvasDrag, toasts } = await openWorkspace(chartsDtoFixture('s0', 's1')));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    await configure();
  });

  it('only starts tracking a drag once the native drag has begun', () => {
    canvasDrag.beginDrag('s3');

    expect(canvasDrag.isDragging()).toBe(false);

    vi.advanceTimersByTime(0);

    expect(canvasDrag.isDragging()).toBe(true);
  });

  it('drops a library chart after a canvas chart and makes it active', () => {
    canvasDrag.beginDrag('s3');
    vi.advanceTimersByTime(0);
    canvasDrag.trackDropTarget('s0', 0.9);

    expect(canvasDrag.dropTarget()).toEqual({ chartId: 's0', position: 'after' });

    canvasDrag.dropOn('s0');

    expect(chartIds()).toEqual(['s0', 's3', 's1']);
    expect(workspace.activeSeriesId()).toBe('s3');
    expect(canvasDrag.isDragging()).toBe(false);
  });

  it('merges a library chart that is not on the canvas yet into the chart whose middle it is dropped on', () => {
    canvasDrag.beginDrag('s3');
    vi.advanceTimersByTime(0);
    canvasDrag.trackDropTarget('s0', 0.5);

    expect(canvasDrag.dropTarget()).toEqual({ chartId: 's0', position: 'merge' });

    canvasDrag.dropOn('s0');

    expect(chartIds()).toEqual(['s0', 's1']);
    expect(workspace.canvas()[0]?.plotted.map((entry) => entry.seriesId)).toEqual(['s0', 's3']);
    expect(workspace.activeSeriesId()).toBe('s3');
    expect(canvasDrag.isDragging()).toBe(false);
  });

  const mergeIntoFirstChart = (chartId: string): void => {
    canvasDrag.beginChartDrag(chartId);
    vi.advanceTimersByTime(0);
    canvasDrag.trackDropTarget('s0', 0.5);
    canvasDrag.dropOn('s0');
  };

  it('merges a chart dragged from the canvas onto the middle of another into it, in its place, and says what was merged into what', () => {
    canvasDrag.beginChartDrag('s1');
    vi.advanceTimersByTime(0);
    canvasDrag.trackDropTarget('s0', 0.5);

    expect(canvasDrag.dropTarget()).toEqual({ chartId: 's0', position: 'merge' });

    canvasDrag.dropOn('s0');

    expect(workspace.canvas()).toEqual([chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's1', axis: 1 })]);
    expect(toasts.message()).toBe('atlas_metric_1 merged into atlas_metric_0');
    expect(canvasDrag.isDragging()).toBe(false);
  });

  it('merges two charts of one unit against a single axis', () => {
    workspace.addToCanvas('s2');
    mergeIntoFirstChart('s2');

    expect(workspace.canvas()[0]).toEqual(chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's2', axis: 0 }));
  });

  const crowdTheFirstChart = (): Canvas => {
    workspace.addToCanvas('s2');
    workspace.addToCanvas('s3');
    workspace.addToCanvas('s4');
    mergeIntoFirstChart('s2');
    mergeIntoFirstChart('s3');
    mergeIntoFirstChart('s4');
    workspace.addToCanvas('s5');
    mergeIntoFirstChart('s5');

    return workspace.canvas();
  };

  it('refuses to merge past five series in one chart, with a toast that says so, and leaves the canvas as it was', () => {
    const crowded = crowdTheFirstChart();

    mergeIntoFirstChart('s1');

    expect(workspace.canvas()).toBe(crowded);
    expect(workspace.canvas()[0]?.plotted).toHaveLength(5);
    expect(toasts.message()).toBe('limit of 5 series in one chart');
  });

  it('merges a series picked from the context menu into the chart it names, with the same toast and undo as a drop', () => {
    canvasDrag.mergeIntoChart('s1', 's0');

    expect(workspace.canvas()).toEqual([chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's1', axis: 1 })]);
    expect(toasts.message()).toBe('atlas_metric_1 merged into atlas_metric_0');
    expect(workspace.contextMenu()).toBeNull();
  });

  it('merges a series that was not on the canvas yet into the chart the menu named, without adding a chart', () => {
    canvasDrag.mergeIntoChart('s3', 's0');

    expect(workspace.canvas()).toEqual([chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's3', axis: 0 }), ...canvasFixture('s1')]);
    expect(chartIds()).toEqual(['s0', 's1']);
  });

  it('refuses a menu merge past five series in one chart, leaving the canvas as it was', () => {
    const crowded = crowdTheFirstChart();

    canvasDrag.mergeIntoChart('s1', 's0');

    expect(workspace.canvas()).toBe(crowded);
    expect(toasts.message()).toBe('limit of 5 series in one chart');
  });

  it('ignores a drop that lands somewhere other than the tracked target', () => {
    canvasDrag.beginDrag('s3');
    vi.advanceTimersByTime(0);
    canvasDrag.trackDropTarget('s0', 0.5);
    canvasDrag.dropOn('s1');

    expect(chartIds()).toEqual(['s0', 's1']);
  });

  it('opens the dragged chart alone on an empty canvas', async () => {
    workspace.removeFromCanvas('s0');
    workspace.removeFromCanvas('s1');
    canvasDrag.beginDrag('s6');
    vi.advanceTimersByTime(0);
    canvasDrag.dropOnCanvasBackground();

    expect(chartIds()).toEqual(['s6']);
  });

  it('adds the dragged chart after the last one when it is dropped on the canvas below the charts', () => {
    canvasDrag.beginDrag('s6');
    vi.advanceTimersByTime(0);
    canvasDrag.dropOnCanvasBackground();

    expect(chartIds()).toEqual(['s0', 's1', 's6']);
  });
});
