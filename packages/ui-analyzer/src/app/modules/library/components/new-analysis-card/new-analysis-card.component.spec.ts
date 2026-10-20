import { TestBed } from '@angular/core/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { NewAnalysisCardComponent } from './new-analysis-card.component';

const texts = messagesFor().newAnalysisCard;

describe('NewAnalysisCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('invites the reader with the catalogue copy and its create pill', () => {
    const fixture = TestBed.createComponent(NewAnalysisCardComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.new-analysis-card-title')).toBe(texts.title);
    expect(textOf(fixture, '.new-analysis-card-subtitle')).toBe(texts.subtitle);
    expect(textOf(fixture, '.new-analysis-card-action')).toBe(texts.action);
  });

  it('takes a file drop: it is marked while the drag is over it, lets the drop land and hands over the files', () => {
    const fixture = TestBed.createComponent(NewAnalysisCardComponent);
    const dropped = vi.fn();
    fixture.componentInstance.filesDropped.subscribe(dropped);
    fixture.detectChanges();
    const card = elementOf(fixture, '.new-analysis-card');
    const file = new File(['RRD'], 'atlas.rrd');
    const over = new MouseEvent('dragover', { bubbles: true, cancelable: true });
    const drop = Object.assign(new MouseEvent('drop', { bubbles: true, cancelable: true }), { dataTransfer: { files: [file] } });

    card?.dispatchEvent(new MouseEvent('dragenter', { bubbles: true }));
    card?.dispatchEvent(over);
    fixture.detectChanges();

    expect(over.defaultPrevented).toBe(true);
    expect(card?.classList.contains('new-analysis-card-active')).toBe(true);

    card?.dispatchEvent(drop);
    fixture.detectChanges();

    expect(drop.defaultPrevented).toBe(true);
    expect(card?.classList.contains('new-analysis-card-active')).toBe(false);
    expect(dropped).toHaveBeenCalledWith([file]);
  });

  it('asks the page to start a new analysis when clicked', () => {
    const fixture = TestBed.createComponent(NewAnalysisCardComponent);
    const started = vi.fn();
    fixture.componentInstance.startRequested.subscribe(started);
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-card')?.click();

    expect(started).toHaveBeenCalledTimes(1);
  });
});
