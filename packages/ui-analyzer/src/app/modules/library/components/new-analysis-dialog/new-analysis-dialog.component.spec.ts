import { TestBed } from '@angular/core/testing';
import { messagesFor } from '@rrd-analyzer/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { countOf, elementOf, hostOf, textOf, textsOf, typeInto } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { LibraryStore } from '../../../../stores/library/store/library-store/library.store';
import { NewAnalysisDialogComponent } from './new-analysis-dialog.component';

const texts = messagesFor();

const dragEventOf = (type: string): Event => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 1, clientY: 1 });

const renderDialog = () => {
  const store = TestBed.inject(LibraryStore);
  store.openDialog();

  const fixture = TestBed.createComponent(NewAnalysisDialogComponent);
  fixture.detectChanges();

  return { fixture, store };
};

const isCreateReady = (fixture: ReturnType<typeof renderDialog>['fixture']): boolean =>
  elementOf(fixture, '.new-analysis-dialog-create')?.classList.contains('new-analysis-dialog-create-ready') ?? false;

describe('NewAnalysisDialogComponent', () => {
  let gateway: AnalyzerGateway;

  beforeEach(() => {
    gateway = analyzerGatewayStub();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
  });

  it('opens on the empty state, with Create not yet ready', () => {
    const { fixture } = renderDialog();

    expect(textOf(fixture, '.pending-source-list-empty')).toBe(texts.newAnalysisDialog.empty);
    expect(textOf(fixture, '.new-analysis-dialog-hint')).toBe(texts.newAnalysisDialog.emptyHint);
    expect(isCreateReady(fixture)).toBe(false);
    expect(elementOf(fixture, '.new-analysis-dialog-hint-missing')).toBeNull();
  });

  it('names its field with a label, and keeps Tab from leaving the dialog for the page behind', () => {
    const { fixture } = renderDialog();
    const nameField = elementOf(fixture, '.new-analysis-dialog-input');

    expect(hostOf(fixture).querySelector<HTMLLabelElement>('label.new-analysis-dialog-label')?.htmlFor).toBe(nameField?.id);

    document.body.appendChild(hostOf(fixture));
    elementOf(fixture, '.new-analysis-dialog-create')?.focus();
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(elementOf(fixture, '.new-analysis-dialog-close'));
  });

  it('pressed with no source, Create makes nothing, marks the hint and takes the focus to the drop zone', async () => {
    const { fixture } = renderDialog();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.createAnalysis).not.toHaveBeenCalled();
    expect(elementOf(fixture, '.new-analysis-dialog-hint-missing')).not.toBeNull();
    expect(document.activeElement).toBe(elementOf(fixture, '.source-drop-zone'));
  });

  it('lists each added source with its size and a palette swatch', () => {
    const { fixture, store } = renderDialog();
    store.addSources([
      { name: 'atlas_prod.rrd', path: '', size: 2048 },
      { name: 'atlas_replica.rrd', path: '', size: 3 * 1_048_576 },
    ]);
    fixture.detectChanges();

    expect(textsOf(fixture, '.pending-source-list-size')).toEqual(['2 KB', '3.0 MB']);
    expect(countOf(fixture, '.pending-source-list-row .color-swatch')).toBe(2);
  });

  it('counts the files in the plural the count calls for, and allows creation', () => {
    const { fixture, store } = renderDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    fixture.detectChanges();

    expect(hostOf(fixture).textContent).toContain('1 file');
    expect(hostOf(fixture).textContent).toContain('1 source ready');
    expect(isCreateReady(fixture)).toBe(true);
  });

  it("takes the focus to the name field, under a heading a screen reader is given as the dialog's own", async () => {
    const { fixture } = renderDialog();
    await fixture.whenStable();

    const dialog = elementOf(fixture, '.new-analysis-dialog');

    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(elementOf(fixture, '.new-analysis-dialog-title')?.id);
    expect(document.activeElement).toBe(elementOf(fixture, '.new-analysis-dialog-input'));
  });

  it('browses for sources when the drop zone is pressed from the keyboard, as a button would', async () => {
    const { fixture } = renderDialog();
    const zone = elementOf(fixture, '.source-drop-zone');

    expect(zone?.getAttribute('role')).toBe('button');

    zone?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await vi.waitFor(() => expect(gateway.pickSources).toHaveBeenCalled());
  });

  it('sends the typed name to the store', () => {
    const { fixture, store } = renderDialog();

    typeInto(fixture, '.new-analysis-dialog-input', 'Capacity review');

    expect(store.draft().name).toBe('Capacity review');
  });

  it('removes one source, and then all of them', () => {
    const { fixture, store } = renderDialog();
    store.addSources([
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'b.rrd', path: '', size: 2 },
    ]);
    fixture.detectChanges();

    elementOf(fixture, '.pending-source-list-row-remove')?.click();

    expect(store.draft().sources.map((source) => source.name)).toEqual(['b.rrd']);

    fixture.detectChanges();
    elementOf(fixture, '.pending-source-list-clear')?.click();

    expect(store.draft().sources).toEqual([]);
  });

  it('closes on cancel, but not on a click inside the card', () => {
    const { fixture, store } = renderDialog();

    elementOf(fixture, '.new-analysis-dialog')?.click();

    expect(store.isDialogOpen()).toBe(true);

    elementOf(fixture, '.new-analysis-dialog-cancel')?.click();

    expect(store.isDialogOpen()).toBe(false);
  });

  it('keeps what was typed and added when closed by Escape, and drops it when cancelled', () => {
    const { fixture, store } = renderDialog();
    typeInto(fixture, '.new-analysis-dialog-input', 'Capacity review');
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(store.isDialogOpen()).toBe(false);
    expect(store.draft()).toEqual({ name: 'Capacity review', sources: [{ name: 'a.rrd', path: '', size: 1 }] });

    store.openDialog();
    elementOf(fixture, '.new-analysis-dialog-cancel')?.click();

    expect(store.isDialogOpen()).toBe(false);
    expect(store.draft()).toEqual({ name: '', sources: [] });
  });

  it('closes on a click that both starts and ends on the scrim', () => {
    const { fixture, store } = renderDialog();
    const scrim = elementOf(fixture, '.new-analysis-dialog-scrim');

    scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    scrim?.click();

    expect(store.isDialogOpen()).toBe(false);
  });

  it('stays open when a text selection started in the name field ends on the scrim', () => {
    const { fixture, store } = renderDialog();

    elementOf(fixture, '.new-analysis-dialog-input')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    elementOf(fixture, '.new-analysis-dialog-scrim')?.click();

    expect(store.isDialogOpen()).toBe(true);
  });

  it('closes on Escape', () => {
    const { store } = renderDialog();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(store.isDialogOpen()).toBe(false);
  });

  it('refuses a second Create, and to close, while the first is still on its way', async () => {
    const { fixture, store } = renderDialog();
    const answer: { release: () => void } = { release: () => undefined };
    vi.mocked(gateway.createAnalysis).mockImplementationOnce(
      async (name) =>
        await new Promise((resolve) => {
          answer.release = () => resolve({ id: 'a1', name, canvas: [], lastAccessedMilliseconds: 0 });
        }),
    );
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();
    await vi.waitFor(() => expect(gateway.createAnalysis).toHaveBeenCalled());
    fixture.detectChanges();

    expect(elementOf(fixture, '.new-analysis-dialog-create')?.hasAttribute('disabled')).toBe(true);
    expect(textOf(fixture, '.new-analysis-dialog-create')).toBe('Creating…');
    expect(elementOf(fixture, '.new-analysis-dialog-create')?.getAttribute('aria-busy')).toBe('true');

    elementOf(fixture, '.new-analysis-dialog-create')?.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(store.isDialogOpen()).toBe(true);

    answer.release();

    await vi.waitFor(() => expect(store.isCreating()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(gateway.createAnalysis).toHaveBeenCalledTimes(1);
    expect(textOf(fixture, '.new-analysis-dialog-create')).toBe('Create analysis');
  });

  it('hands the created analysis to the page so it can be opened', async () => {
    const { fixture, store } = renderDialog();
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();

    await vi.waitFor(() => expect(created).toHaveBeenCalledWith('a1'));
  });

  it('browses for sources when the drop zone is clicked', async () => {
    const { fixture } = renderDialog();

    elementOf(fixture, '.source-drop-zone')?.click();

    await vi.waitFor(() => expect(gateway.pickSources).toHaveBeenCalled());
  });

  it('highlights the drop zone while a drag hovers it', () => {
    const { fixture, store } = renderDialog();
    const zone = elementOf(fixture, '.source-drop-zone');

    zone?.dispatchEvent(dragEventOf('dragenter'));

    expect(store.isDropActive()).toBe(true);

    zone?.dispatchEvent(dragEventOf('dragleave'));

    expect(store.isDropActive()).toBe(false);
  });

  it('NewAnalysisDialogComponent takes the files dropped on the drop zone in as sources', async () => {
    const { fixture, store } = renderDialog();
    const drop = Object.assign(dragEventOf('drop'), { dataTransfer: { files: [new File(['RRD'], 'atlas.rrd')] } });

    elementOf(fixture, '.source-drop-zone')?.dispatchEvent(drop);

    await vi.waitFor(() => expect(store.draft().sources.map((source) => source.name)).toEqual(['atlas.rrd']));
  });

  it('NewAnalysisDialogComponent keeps the dialog and what it holds when Cancel is pressed while a Create is on its way', async () => {
    const { fixture, store } = renderDialog();
    const answer: { release: () => void } = { release: () => undefined };
    vi.mocked(gateway.createAnalysis).mockImplementationOnce(
      async (name) =>
        await new Promise((resolve) => {
          answer.release = () => resolve({ id: 'a1', name, canvas: [], lastAccessedMilliseconds: 0 });
        }),
    );
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();
    await vi.waitFor(() => expect(gateway.createAnalysis).toHaveBeenCalled());
    elementOf(fixture, '.new-analysis-dialog-cancel')?.click();

    expect(store.isDialogOpen()).toBe(true);
    expect(store.draft().sources.map((source) => source.name)).toEqual(['a.rrd']);

    answer.release();
    await vi.waitFor(() => expect(store.isCreating()).toBe(false));
  });

  it('NewAnalysisDialogComponent hands nothing to the page when the analysis could not be created', async () => {
    const { fixture, store } = renderDialog();
    const created = vi.fn();
    fixture.componentInstance.created.subscribe(created);
    vi.mocked(gateway.createAnalysis).mockRejectedValueOnce(new Error('disk full'));
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    fixture.detectChanges();

    elementOf(fixture, '.new-analysis-dialog-create')?.click();

    await vi.waitFor(() => expect(gateway.createAnalysis).toHaveBeenCalled());
    await vi.waitFor(() => expect(store.isCreating()).toBe(false));
    expect(created).not.toHaveBeenCalled();
    expect(store.isDialogOpen()).toBe(true);
  });

  it('NewAnalysisDialogComponent, compiled again from its own metadata as a TestBed override compiles it, still focuses its name field and sends a Create with no source to the drop zone', async () => {
    TestBed.overrideComponent(NewAnalysisDialogComponent, { set: {} });
    await TestBed.compileComponents();
    const { fixture } = renderDialog();
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.new-analysis-dialog-input'));

    elementOf(fixture, '.new-analysis-dialog-create')?.click();
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.source-drop-zone'));
  });
});
