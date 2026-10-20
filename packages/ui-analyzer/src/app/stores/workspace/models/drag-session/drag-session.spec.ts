import { describe, expect, it } from 'vitest';
import { DRAG_ORIGINS, type DraggedItem } from '../canvas-operations/canvas-operations';
import type { SeriesTraits } from '../chart-axes/chart-axes';
import { canvasFixture, chartFixture } from '../plotted-chart/plotted-chart.fixture';
import { draggedOver, droppedOnCanvasBackground, droppedOnChart, leftChart, startedSession } from './drag-session';

const canvasOf = canvasFixture;

const traitsOf = (seriesId: string): SeriesTraits => ({ unit: seriesId === 's0' ? '%' : 'B', magnitude: null });

const fromLibrary = (seriesId: string): DraggedItem => ({ origin: DRAG_ORIGINS.LIBRARY, seriesId });

const fromCanvas = (chartId: string): DraggedItem => ({ origin: DRAG_ORIGINS.CANVAS, seriesId: chartId });

const CANVAS = canvasOf('s0', 's1', 's3');

describe('draggedOver', () => {
  it('aims at the position under the pointer, and keeps the same session while the aim does not change', () => {
    const aimed = draggedOver(startedSession(fromLibrary('s3')), CANVAS, 's0', 0.9);

    expect(aimed.dropTarget).toEqual({ chartId: 's0', position: 'after' });
    expect(draggedOver(aimed, CANVAS, 's0', 0.95)).toBe(aimed);
  });

  it('aims at a merge when a chart from the canvas or the library hovers the middle of another', () => {
    expect(draggedOver(startedSession(fromCanvas('s3')), CANVAS, 's0', 0.5).dropTarget).toEqual({ chartId: 's0', position: 'merge' });
    expect(draggedOver(startedSession(fromLibrary('s2')), CANVAS, 's0', 0.5).dropTarget).toEqual({ chartId: 's0', position: 'merge' });
  });

  it('aims at nothing when a chart hovers the middle of itself', () => {
    expect(draggedOver(startedSession(fromCanvas('s3')), CANVAS, 's3', 0.5).dropTarget).toBeNull();
  });
});

describe('leftChart', () => {
  it('stops aiming at the chart the drag left', () => {
    const aimed = draggedOver(startedSession(fromCanvas('s3')), CANVAS, 's0', 0.9);

    expect(leftChart(aimed, 's0').dropTarget).toBeNull();
  });

  it('keeps the aim when the chart left is not the one aimed at, as when the drag already reached the next chart', () => {
    const aimed = draggedOver(startedSession(fromCanvas('s3')), CANVAS, 's1', 0.9);

    expect(leftChart(aimed, 's0')).toBe(aimed);
  });
});

describe('droppedOnChart', () => {
  it('places the dragged chart where the session aimed', () => {
    const session = draggedOver(startedSession(fromLibrary('s3')), canvasOf('s0', 's1'), 's0', 0.9);

    expect(droppedOnChart(session, canvasOf('s0', 's1'), 's0', traitsOf)).toEqual({ kind: 'placed', canvas: canvasOf('s0', 's3', 's1'), activeSeriesId: 's3' });
  });

  it('merges a chart dropped on the middle of another, naming what was merged into what', () => {
    const session = draggedOver(startedSession(fromCanvas('s3')), CANVAS, 's0', 0.5);

    expect(droppedOnChart(session, CANVAS, 's0', traitsOf)).toEqual({
      kind: 'merged',
      canvas: [chartFixture({ seriesId: 's0', axis: 0 }, { seriesId: 's3', axis: 1 }), ...canvasOf('s1')],
      activeSeriesId: 's3',
      mergedSeriesIds: ['s3'],
      targetChartId: 's0',
    });
  });

  it('ignores a drop on another chart than the one aimed at, or with nothing dragged', () => {
    const session = draggedOver(startedSession(fromLibrary('s3')), canvasOf('s0', 's1'), 's0', 0.5);

    expect(droppedOnChart(session, canvasOf('s0', 's1'), 's1', traitsOf)).toEqual({ kind: 'ignored' });
    expect(droppedOnChart(null, canvasOf('s0'), 's0', traitsOf)).toEqual({ kind: 'ignored' });
  });

  it('places a sixth chart and more, the canvas having no limit', () => {
    const five = canvasOf('s0', 's1', 's2', 's3', 's4');
    const session = draggedOver(startedSession(fromLibrary('s9')), five, 's0', 0.1);

    expect(droppedOnChart(session, five, 's0', traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasOf('s9', 's0', 's1', 's2', 's3', 's4'),
      activeSeriesId: 's9',
    });
  });
});

describe('droppedOnCanvasBackground', () => {
  it('opens the dragged chart alone on an empty canvas, and ignores a drop with nothing dragged', () => {
    expect(droppedOnCanvasBackground(startedSession(fromLibrary('s6')), [], traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasOf('s6'),
      activeSeriesId: 's6',
    });
    expect(droppedOnCanvasBackground(null, CANVAS, traitsOf)).toEqual({ kind: 'ignored' });
  });

  it('puts a chart from the library after the last chart when dropped in the space below the charts', () => {
    expect(droppedOnCanvasBackground(startedSession(fromLibrary('s6')), CANVAS, traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasOf('s0', 's1', 's3', 's6'),
      activeSeriesId: 's6',
    });
  });

  it('moves a chart from the canvas to the end, and ignores the drop of the chart that is already last', () => {
    expect(droppedOnCanvasBackground(startedSession(fromCanvas('s0')), CANVAS, traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasOf('s1', 's3', 's0'),
      activeSeriesId: 's0',
    });
    expect(droppedOnCanvasBackground(startedSession(fromCanvas('s3')), CANVAS, traitsOf)).toEqual({ kind: 'ignored' });
  });

  it('puts a sixth chart dropped below five charts after the last one', () => {
    const five = canvasOf('s0', 's1', 's2', 's3', 's4');

    expect(droppedOnCanvasBackground(startedSession(fromLibrary('s9')), five, traitsOf)).toEqual({
      kind: 'placed',
      canvas: canvasOf('s0', 's1', 's2', 's3', 's4', 's9'),
      activeSeriesId: 's9',
    });
  });
});
