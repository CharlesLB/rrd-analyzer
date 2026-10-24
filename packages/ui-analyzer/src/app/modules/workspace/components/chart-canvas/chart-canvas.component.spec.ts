import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countOf, elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ChartCanvasComponent } from './chart-canvas.component';

@Component({
  selector: 'app-chart-canvas-host',
  imports: [ChartCanvasComponent],
  template: `
    <app-chart-canvas [chartHeights]="heights()" [isCompact]="false" [isDragging]="isDragging" (backgroundDropped)="backgroundDropped()">
      <div class="chart-canvas-host-panel"></div>
      <div class="chart-canvas-host-panel"></div>
    </app-chart-canvas>
  `,
})
class ChartCanvasHostComponent {
  public readonly heights = signal<readonly (number | null)[]>([null, null]);
  public readonly isDragging = true;
  public readonly backgroundDropped = vi.fn();
}

const dragOver = (target: Element | null | undefined): Event => {
  const over = new Event('dragover', { bubbles: true, cancelable: true });
  target?.dispatchEvent(over);

  return over;
};

const dragOverAndDropOn = (target: Element | null | undefined): Event => {
  const over = dragOver(target);
  target?.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));

  return over;
};

const renderShortenedCharts = () => {
  const fixture = TestBed.createComponent(ChartCanvasHostComponent);
  fixture.componentInstance.heights.set([300, 200]);
  fixture.detectChanges();

  return fixture;
};

describe('ChartCanvasComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('lays the panels it is given in a grid of one row per chart, stretched to fill the height', () => {
    const fixture = TestBed.createComponent(ChartCanvasHostComponent);
    fixture.detectChanges();
    const canvas = elementOf(fixture, '.chart-canvas');

    expect(countOf(fixture, '.chart-canvas > .chart-canvas-host-panel')).toBe(2);
    expect((canvas?.style.gridTemplateRows ?? '').replaceAll(' ', '')).toMatch(/^minmax\(0(px)?,1fr\)minmax\(0(px)?,1fr\)$/);
    expect(canvas?.style.overflowY).toBe('hidden');
    expect(elementOf(fixture, '.chart-canvas-empty')).toBeNull();
  });

  it('invites a first chart on an empty canvas and accepts a drop there', () => {
    const fixture = renderWithInputs(ChartCanvasComponent, { chartHeights: [], isCompact: false, isDragging: true });
    const dropped = vi.fn();
    fixture.componentInstance.backgroundDropped.subscribe(dropped);
    const empty = elementOf(fixture, '.chart-canvas-empty');

    expect(empty?.textContent).toContain('Empty canvas.');
    expect(empty?.textContent).toContain('Click a chart on the left to open it. Right-click or drag to add more.');

    const over = dragOverAndDropOn(empty?.querySelector('.chart-canvas-empty-hint'));

    expect(over.defaultPrevented).toBe(true);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('accepts a drop on the space left below charts that were given a height', () => {
    const fixture = renderShortenedCharts();

    const over = dragOverAndDropOn(elementOf(fixture, '.chart-canvas'));

    expect(over.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.backgroundDropped).toHaveBeenCalledTimes(1);
  });

  it('leaves a drop on a chart to the chart, so the canvas does not add it a second time', () => {
    const fixture = renderShortenedCharts();

    const over = dragOverAndDropOn(elementOf(fixture, '.chart-canvas-host-panel'));

    expect(over.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.backgroundDropped).not.toHaveBeenCalled();
  });

  it('accepts no drop in the gaps between charts that stretch to fill the canvas, since there is no room below them', () => {
    const fixture = TestBed.createComponent(ChartCanvasHostComponent);
    fixture.detectChanges();

    const over = dragOverAndDropOn(elementOf(fixture, '.chart-canvas'));

    expect(over.defaultPrevented).toBe(false);
    expect(fixture.componentInstance.backgroundDropped).not.toHaveBeenCalled();
  });

  it('shows where the chart will go while the space below the charts is aimed at, and stops once a chart is aimed at', () => {
    const fixture = renderShortenedCharts();

    dragOver(elementOf(fixture, '.chart-canvas'));
    fixture.detectChanges();

    expect(textOf(fixture, '.chart-canvas-slot')).toBe('Add here');

    dragOver(elementOf(fixture, '.chart-canvas-host-panel'));
    fixture.detectChanges();

    expect(elementOf(fixture, '.chart-canvas-slot')).toBeNull();
  });

  it('takes the slot away once the chart is dropped', () => {
    const fixture = renderShortenedCharts();
    const canvas = elementOf(fixture, '.chart-canvas');

    dragOverAndDropOn(canvas);
    fixture.detectChanges();

    expect(elementOf(fixture, '.chart-canvas-slot')).toBeNull();
  });

  it('lights up the empty canvas while a chart is held over it', () => {
    const fixture = renderWithInputs(ChartCanvasComponent, { chartHeights: [], isCompact: false, isDragging: true });

    dragOver(elementOf(fixture, '.chart-canvas-empty'));
    fixture.detectChanges();

    expect(elementOf(fixture, '.chart-canvas-empty')?.classList.contains('chart-canvas-empty-aimed')).toBe(true);
  });

  it('ChartCanvasComponent keeps showing where the chart will go while the drag only crosses into a chart, and stops once it leaves the canvas', () => {
    const fixture = renderShortenedCharts();
    const canvas = elementOf(fixture, '.chart-canvas');

    const leaveAt = (clientX: number): void => {
      canvas?.dispatchEvent(new MouseEvent('dragleave', { clientX, clientY: 100 }));
      fixture.detectChanges();
    };

    if (canvas !== null) {
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => '',
      });
    }

    dragOver(canvas);
    fixture.detectChanges();
    leaveAt(400);

    expect(elementOf(fixture, '.chart-canvas-slot')).not.toBeNull();

    leaveAt(900);

    expect(elementOf(fixture, '.chart-canvas-slot')).toBeNull();
  });
});
