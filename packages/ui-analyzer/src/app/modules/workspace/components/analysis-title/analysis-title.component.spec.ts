import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { AnalysisTitleComponent } from './analysis-title.component';

const ADD_ITEM = '.analysis-title-menu-item:first-of-type';
const EXPORT_ITEM = '.analysis-title-menu-item:last-of-type';

const renderTitle = (sourceFileCount = 2) => {
  const fixture = renderWithInputs(AnalysisTitleComponent, { name: 'Atlas prod · capacity', sourceFileCount, isCompact: false });
  const renamed = vi.fn();
  const exportRequested = vi.fn();

  fixture.componentInstance.renamed.subscribe(renamed);
  fixture.componentInstance.sourcesExportRequested.subscribe(exportRequested);

  return { fixture, renamed, exportRequested };
};

const pressOn = (element: HTMLElement | null, key: string): void => {
  element?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

const startEditing = async (fixture: ReturnType<typeof renderTitle>['fixture']): Promise<void> => {
  elementOf(fixture, '.analysis-title-name')?.click();
  fixture.detectChanges();
  await fixture.whenStable();
};

const submitName = async (fixture: ReturnType<typeof renderTitle>['fixture']): Promise<void> => {
  elementOf(fixture, '.analysis-title-form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  await fixture.whenStable();
  fixture.detectChanges();
};

describe('AnalysisTitleComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('analysis title shows the name as a button that renames it, and a caret named for a reader that cannot see it', () => {
    const { fixture } = renderTitle();

    expect(textOf(fixture, '.analysis-title-name')).toBe('Atlas prod · capacity');
    expect(elementOf(fixture, '.analysis-title-name')?.getAttribute('title')).toBe('rename analysis');
    expect(elementOf(fixture, '.analysis-title-menu-toggle')?.getAttribute('aria-label')).toBe('analysis menu');
  });

  it('analysis title clicked opens a field holding the current name, and submitting it reports the trimmed new name', async () => {
    const { fixture, renamed } = renderTitle();

    await startEditing(fixture);
    expect((elementOf(fixture, '.analysis-title-input') as HTMLInputElement | null)?.value).toBe('Atlas prod · capacity');

    typeInto(fixture, '.analysis-title-input', '  Atlas prod · p99  ');
    await submitName(fixture);

    expect(renamed).toHaveBeenCalledExactlyOnceWith('Atlas prod · p99');
    expect(elementOf(fixture, '.analysis-title-input')).toBeNull();
  });

  it('analysis title left by blurring the field keeps what was typed, the way a submit would', async () => {
    const { fixture, renamed } = renderTitle();

    await startEditing(fixture);
    typeInto(fixture, '.analysis-title-input', 'Capacity review');
    elementOf(fixture, '.analysis-title-input')?.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(renamed).toHaveBeenCalledExactlyOnceWith('Capacity review');
  });

  it('analysis title reports nothing when the name is cleared, left unchanged, or the edit is escaped', async () => {
    const { fixture, renamed } = renderTitle();

    await startEditing(fixture);
    typeInto(fixture, '.analysis-title-input', '   ');
    await submitName(fixture);

    await startEditing(fixture);
    await submitName(fixture);

    await startEditing(fixture);
    typeInto(fixture, '.analysis-title-input', 'Discarded');
    pressOn(elementOf(fixture, '.analysis-title-input'), 'Escape');
    fixture.detectChanges();

    expect(renamed).not.toHaveBeenCalled();
    expect(textOf(fixture, '.analysis-title-name')).toBe('Atlas prod · capacity');
  });

  it('analysis menu opened from the caret offers the rrd files and reports the export it was asked for', () => {
    const { fixture, exportRequested } = renderTitle(3);

    elementOf(fixture, '.analysis-title-menu-toggle')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.analysis-title-menu-toggle')?.getAttribute('aria-expanded')).toBe('true');
    expect(textOf(fixture, `${EXPORT_ITEM} .analysis-title-menu-title`)).toBe('Export RRD files');
    expect(textOf(fixture, `${EXPORT_ITEM} .analysis-title-menu-detail`)).toBe('a zip of the 3 source files');

    elementOf(fixture, EXPORT_ITEM)?.click();
    fixture.detectChanges();

    expect(exportRequested).toHaveBeenCalledTimes(1);
    expect(elementOf(fixture, '.analysis-title-menu-item')).toBeNull();
  });

  it('analysis menu offers to read more rrd files into the analysis first, and reports the request', () => {
    const { fixture, exportRequested } = renderTitle();
    const addRequested = vi.fn();
    fixture.componentInstance.sourcesAddRequested.subscribe(addRequested);

    elementOf(fixture, '.analysis-title-menu-toggle')?.click();
    fixture.detectChanges();

    expect(textOf(fixture, `${ADD_ITEM} .analysis-title-menu-title`)).toBe('Add RRD files');
    expect(textOf(fixture, `${ADD_ITEM} .analysis-title-menu-detail`)).toBe('read more files into this analysis');

    elementOf(fixture, ADD_ITEM)?.click();
    fixture.detectChanges();

    expect(addRequested).toHaveBeenCalledTimes(1);
    expect(exportRequested).not.toHaveBeenCalled();
    expect(elementOf(fixture, '.analysis-title-menu-item')).toBeNull();
  });

  it('analysis menu of a single source offers a copy of that file', () => {
    const { fixture } = renderTitle(1);

    elementOf(fixture, '.analysis-title-menu-toggle')?.click();
    fixture.detectChanges();

    expect(textOf(fixture, `${EXPORT_ITEM} .analysis-title-menu-detail`)).toBe('a copy of the source file');
  });

  it('analysis menu closes on its backdrop and when its owner closes it, without exporting', () => {
    const { fixture, exportRequested } = renderTitle();
    const toggle = elementOf(fixture, '.analysis-title-menu-toggle');

    toggle?.click();
    fixture.detectChanges();
    elementOf(fixture, '.anchored-menu-backdrop')?.click();
    fixture.detectChanges();
    expect(elementOf(fixture, '.analysis-title-menu-item')).toBeNull();

    toggle?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.isMenuOpen()).toBe(true);
    fixture.componentInstance.closeMenu();
    fixture.detectChanges();

    expect(elementOf(fixture, '.analysis-title-menu-item')).toBeNull();
    expect(exportRequested).not.toHaveBeenCalled();
  });
});
