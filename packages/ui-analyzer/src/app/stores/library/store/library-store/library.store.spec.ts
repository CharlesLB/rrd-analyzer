import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalysisDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analysisDtoFixture, analyzerGatewayStub, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { LibraryStore } from './library.store';

describe('LibraryStore', () => {
  let store: LibraryStore;
  let toasts: ToastStore;
  let gateway: AnalyzerGateway;

  beforeEach(() => {
    gateway = analyzerGatewayStub({ listAnalyses: vi.fn().mockResolvedValue([analysisDtoFixture({ name: 'Atlas' })]) });
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    store = TestBed.inject(LibraryStore);
    toasts = TestBed.inject(ToastStore);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the library again on every refresh, since a workspace may have changed it', async () => {
    await store.refresh();
    await store.refresh();

    expect(store.analyses()).toHaveLength(1);
    expect(gateway.listAnalyses).toHaveBeenCalledTimes(2);
  });

  it('refresh looks for the files of every analysis, so the library says which ones went missing before any is opened', async () => {
    vi.mocked(gateway.listAnalyses).mockResolvedValue([analysisDtoFixture({ id: 'a1' }), analysisDtoFixture({ id: 'a2' })]);
    vi.mocked(gateway.missingSources).mockImplementation(async (analysisId) =>
      analysisId === 'a2' ? [{ name: 'cpu.rrd', path: '/data/cpu.rrd', size: 1 }] : [],
    );

    await store.refresh();

    await vi.waitFor(() => expect(store.missingSources()).toEqual({ a2: ['cpu.rrd'] }));
  });

  it('checkSources clears a missing file once it is back, and counts an analysis it cannot check as complete', async () => {
    vi.mocked(gateway.listAnalyses).mockResolvedValue([analysisDtoFixture({ id: 'a1' }), analysisDtoFixture({ id: 'a2' })]);
    vi.mocked(gateway.missingSources).mockResolvedValue([{ name: 'cpu.rrd', path: '/data/cpu.rrd', size: 1 }]);
    await store.refresh();
    await vi.waitFor(() => expect(Object.keys(store.missingSources())).toEqual(['a1', 'a2']));

    vi.mocked(gateway.missingSources).mockImplementation(async (analysisId) => {
      if (analysisId === 'a1') {
        throw new Error('daemon away');
      }

      return [];
    });
    await store.checkSources();

    expect(store.missingSources()).toEqual({});
  });

  it('reopens the dialog on the draft it was closed with, so a slip of the hand loses nothing', () => {
    store.openDialog();
    store.draft.update((draft) => ({ ...draft, name: 'half typed' }));
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    store.closeDialog();
    store.openDialog();

    expect(store.draft().name).toBe('half typed');
    expect(store.draft().sources.map((source) => source.name)).toEqual(['a.rrd']);
  });

  it('discardDraft closes the dialog and empties the draft, for whoever says they do not want it', () => {
    store.openDialog();
    store.draft.update((draft) => ({ ...draft, name: 'half typed' }));
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    store.discardDraft();
    store.openDialog();

    expect(store.draft()).toEqual({ name: '', sources: [] });
  });

  it('createAnalysis that succeeds empties the draft, so the next dialog starts afresh', async () => {
    store.openDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    await store.createAnalysis();

    expect(store.draft()).toEqual({ name: '', sources: [] });
  });

  it('rejects a source that is not an rrd or xml dump, and says so', () => {
    store.openDialog();
    store.addSources([{ name: 'notes.txt', path: '', size: 1 }]);

    expect(store.draft().sources).toEqual([]);
    expect(toasts.message()).toBe('Only .rrd or .xml dumps are supported');
  });

  it('addSources given dumps among other files keeps the dumps and says how many files were skipped', () => {
    store.openDialog();

    store.addSources([
      { name: 'README.md', path: '', size: 1 },
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'collector.log', path: '', size: 1 },
    ]);

    expect(store.draft().sources.map((source) => source.name)).toEqual(['a.rrd']);
    expect(toasts.message()).toBe('2 files were skipped: only .rrd or .xml dumps are supported');
  });

  it('never lists the same source name twice', () => {
    store.openDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);
    store.addSources([
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'b.rrd', path: '', size: 2 },
    ]);

    expect(store.draft().sources.map((source) => source.name)).toEqual(['a.rrd', 'b.rrd']);
  });

  it('addSources given a file already listed says how many were left out as repeated', () => {
    store.openDialog();
    store.addSources([{ name: 'cpu.rrd', path: '/host1/cpu.rrd', size: 1 }]);

    store.addSources([
      { name: 'cpu.rrd', path: '/host1/cpu.rrd', size: 1 },
      { name: 'cpu.rrd', path: '/host2/cpu.rrd', size: 1 },
    ]);

    expect(store.draft().sources.map((source) => source.path)).toEqual(['/host1/cpu.rrd', '/host2/cpu.rrd']);
    expect(toasts.message()).toBe('1 file was already listed');
  });

  it('removes one source, and all of them', () => {
    store.openDialog();
    store.addSources([
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'b.rrd', path: '', size: 2 },
    ]);
    store.removeSourceAt(0);

    expect(store.draft().sources.map((source) => source.name)).toEqual(['b.rrd']);

    store.clearSources();

    expect(store.draft().sources).toEqual([]);
  });

  it('will not create an analysis with no sources', async () => {
    store.openDialog();

    expect(await store.createAnalysis()).toBeNull();
    expect(gateway.createAnalysis).not.toHaveBeenCalled();
  });

  it('names an unnamed single-source analysis after its file', async () => {
    store.openDialog();
    store.addSources([{ name: 'atlas-prod.rrd', path: '', size: 1 }]);
    await store.createAnalysis();

    expect(gateway.createAnalysis).toHaveBeenCalledWith('atlas-prod', expect.anything());
  });

  it('createAnalysis from a single source named only .rrd names it Untitled analysis rather than nothing', async () => {
    store.openDialog();
    store.addSources([{ name: '.rrd', path: '', size: 1 }]);

    await store.createAnalysis();

    expect(gateway.createAnalysis).toHaveBeenCalledWith('Untitled analysis', expect.anything());
  });

  it('addSources given the same name twice in one pick lists it once, as picked first', () => {
    store.openDialog();

    store.addSources([
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'a.rrd', path: '', size: 2 },
    ]);

    expect(store.draft().sources).toEqual([{ name: 'a.rrd', path: '', size: 1 }]);
  });

  it('falls back to a placeholder name for several sources', async () => {
    store.openDialog();
    store.addSources([
      { name: 'a.rrd', path: '', size: 1 },
      { name: 'b.rrd', path: '', size: 2 },
    ]);
    await store.createAnalysis();

    expect(gateway.createAnalysis).toHaveBeenCalledWith('Untitled analysis', expect.anything());
  });

  it('hands back the analysis once it exists, leaving the dialog open for its opener to close after navigating', async () => {
    store.openDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    const created = await store.createAnalysis();

    expect(created?.id).toBe('a1');
    expect(store.isDialogOpen()).toBe(true);
  });

  it('remove takes the analysis off the list at once and offers to undo, without deleting anything yet', async () => {
    await store.refresh();

    store.remove('a1');

    expect(store.analyses()).toEqual([]);
    expect(toasts.message()).toBe('analysis deleted');
    expect(toasts.actionLabel()).toBe('Undo');
    expect(gateway.deleteAnalysis).not.toHaveBeenCalled();
  });

  it('remove undone from its toast brings the analysis back and never asks the daemon to delete it', async () => {
    await store.refresh();
    store.remove('a1');

    toasts.runAction();
    toasts.dismiss();
    void store.settleRemovals();

    expect(store.analyses()).toHaveLength(1);
    expect(gateway.deleteAnalysis).not.toHaveBeenCalled();
  });

  it('remove whose toast goes without Undo deletes the analysis for good, without reading the library again', async () => {
    await store.refresh();
    store.remove('a1');

    toasts.dismiss();
    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a1'));

    expect(store.analyses()).toEqual([]);
    expect(gateway.listAnalyses).toHaveBeenCalledTimes(1);
  });

  it('settleRemovals deletes at once what was still waiting for an Undo, once, and takes its toast away', async () => {
    await store.refresh();
    store.remove('a1');

    void store.settleRemovals();
    void store.settleRemovals();
    toasts.dismiss();
    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledTimes(1));

    expect(toasts.message()).toBeNull();
  });

  it('remove of a second analysis settles the first, whose Undo is gone with its toast', async () => {
    vi.mocked(gateway.listAnalyses).mockResolvedValue([analysisDtoFixture({ id: 'a1' }), analysisDtoFixture({ id: 'a2' })]);
    await store.refresh();

    store.remove('a1');
    store.remove('a2');

    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a1'));
    expect(gateway.deleteAnalysis).not.toHaveBeenCalledWith('a2');
    expect(store.analyses()).toEqual([]);
  });

  it('refresh while a removal still waits for its Undo keeps the removed analysis off the list', async () => {
    await store.refresh();
    store.remove('a1');

    await store.refresh();

    expect(store.analyses()).toEqual([]);
  });

  it('refresh answered after a delete made meanwhile reads the library again rather than bringing the deleted analysis back', async () => {
    await store.refresh();
    const slow: { resolve: (analyses: readonly AnalysisDto[]) => void } = { resolve: () => undefined };
    vi.mocked(gateway.listAnalyses)
      .mockImplementationOnce(
        async () =>
          await new Promise<readonly AnalysisDto[]>((resolve) => {
            slow.resolve = resolve;
          }),
      )
      .mockResolvedValueOnce([]);

    const refreshing = store.refresh();
    await vi.waitFor(() => expect(gateway.listAnalyses).toHaveBeenCalledTimes(2));
    store.remove('a1');
    toasts.dismiss();
    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalled());
    await Promise.resolve();
    slow.resolve([analysisDtoFixture({ name: 'Atlas' })]);
    await refreshing;

    expect(store.analyses()).toEqual([]);
    expect(gateway.listAnalyses).toHaveBeenCalledTimes(3);
  });

  it('renamed shows the new name of a listed analysis at once, first on the list as the one open right now', async () => {
    vi.mocked(gateway.listAnalyses).mockResolvedValue([
      analysisDtoFixture({ id: 'a0', name: 'HTTP latency' }),
      analysisDtoFixture({ id: 'a1', name: 'Atlas' }),
    ]);
    await store.refresh();

    store.renamed('a1', 'Atlas p99');

    expect(store.analyses().map((analysis) => analysis.name)).toEqual(['Atlas p99', 'HTTP latency']);
  });

  it('createAnalysis lists the new analysis first, as the most recently opened one', async () => {
    vi.mocked(gateway.listAnalyses).mockResolvedValue([analysisDtoFixture({ id: 'a0', name: 'HTTP latency' })]);
    await store.refresh();
    store.openDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    await store.createAnalysis();

    expect(store.analyses().map((analysis) => analysis.id)).toEqual(['a1', 'a0']);
  });

  it('remove of the same analysis twice deletes it for good once, and the Undo of the second toast cannot bring it back', async () => {
    await store.refresh();

    store.remove('a1');
    store.remove('a1');
    toasts.runAction();
    await vi.waitFor(() => expect(gateway.deleteAnalysis).toHaveBeenCalledWith('a1'));

    await vi.waitFor(() => expect(store.analyses()).toEqual([]));
    expect(gateway.deleteAnalysis).toHaveBeenCalledTimes(1);
  });

  it('remove of the same analysis twice, its second toast going without Undo, asks the daemon to delete it only once', async () => {
    await store.refresh();

    store.remove('a1');
    store.remove('a1');
    toasts.dismiss();
    await store.settleRemovals();

    expect(gateway.deleteAnalysis).toHaveBeenCalledTimes(1);
    expect(store.analyses()).toEqual([]);
  });

  it('remove refused by the daemon puts the analysis back on the list and says it could not be deleted', async () => {
    vi.mocked(gateway.deleteAnalysis).mockRejectedValue(new Error('locked'));
    await store.refresh();
    store.remove('a1');

    toasts.dismiss();

    await vi.waitFor(() => expect(toasts.message()).toBe('the analysis could not be deleted'));
    expect(store.analyses()).toHaveLength(1);
  });

  it('refresh that cannot read the library says so, and a later refresh that can clears it', async () => {
    vi.mocked(gateway.listAnalyses).mockRejectedValueOnce(new Error('offline'));

    await store.refresh();

    expect(store.hasLoadFailed()).toBe(true);
    expect(store.isLoading()).toBe(false);

    await store.refresh();

    expect(store.hasLoadFailed()).toBe(false);
    expect(store.analyses()).toHaveLength(1);
  });

  it('createAnalysis refused by the daemon hands back nothing, says so and keeps the dialog open', async () => {
    vi.mocked(gateway.createAnalysis).mockRejectedValue(new Error('refused'));
    store.openDialog();
    store.addSources([{ name: 'a.rrd', path: '', size: 1 }]);

    const created = await store.createAnalysis();

    expect(created).toBeNull();
    expect(store.isDialogOpen()).toBe(true);
    expect(toasts.message()).toBe('the analysis could not be created');
  });

  it('addDroppedFiles while the dialog is closed opens it holding the dropped dumps, as the gateway describes them', async () => {
    await store.addDroppedFiles([new File(['RRD'], 'a.rrd')]);

    expect(store.isDialogOpen()).toBe(true);
    expect(store.draft().sources).toEqual([{ name: 'a.rrd', path: 'memory:/1/a.rrd', size: 3 }]);
  });

  it('addDroppedFiles hands the gateway only the dumps, never a file it would refuse anyway', async () => {
    await store.addDroppedFiles([new File(['RRD'], 'a.rrd'), new File(['notes'], 'notes.txt')]);

    expect(vi.mocked(gateway.describeFiles).mock.calls[0]?.[0].map((file) => file.name)).toEqual(['a.rrd']);
    expect(store.draft().sources.map((source) => source.name)).toEqual(['a.rrd']);
    expect(toasts.message()).toContain('1');
  });

  it('addDroppedFiles given no dump while the dialog is closed leaves it closed and says what is supported', async () => {
    await store.addDroppedFiles([new File(['notes'], 'notes.txt')]);

    expect(store.isDialogOpen()).toBe(false);
    expect(gateway.describeFiles).not.toHaveBeenCalled();
    expect(toasts.message()).toBe('Only .rrd or .xml dumps are supported');
  });

  it('addDroppedFiles whose files cannot be read says so and adds nothing', async () => {
    vi.mocked(gateway.describeFiles).mockRejectedValue(new Error('unreadable'));

    await store.addDroppedFiles([new File(['RRD'], 'a.rrd')]);

    expect(store.draft().sources).toEqual([]);
    expect(toasts.message()).toBe('the picked files could not be read');
  });

  it('a native drop while the dialog is closed opens it holding the files the host describes', async () => {
    const native: { drop: (paths: readonly string[]) => void } = { drop: () => undefined };
    vi.mocked(gateway.watchFileDrop).mockImplementation((handler) => {
      native.drop = handler;

      return () => undefined;
    });
    store.watchNativeFileDrop();
    await vi.waitFor(() => expect(gateway.watchFileDrop).toHaveBeenCalled());

    native.drop(['/dropped.rrd']);

    await vi.waitFor(() => expect(store.draft().sources).toEqual([{ name: 'dropped.rrd', path: '/dropped.rrd', size: 1024 }]));
    expect(gateway.describeSources).toHaveBeenCalledWith(['/dropped.rrd']);
    expect(store.isDialogOpen()).toBe(true);
  });

  it('a native drop whose files the host cannot describe says so and adds nothing', async () => {
    const native: { drop: (paths: readonly string[]) => void } = { drop: () => undefined };
    vi.mocked(gateway.watchFileDrop).mockImplementation((handler) => {
      native.drop = handler;

      return () => undefined;
    });
    vi.mocked(gateway.describeSources).mockRejectedValue(new Error('unreadable'));
    store.watchNativeFileDrop();
    await vi.waitFor(() => expect(gateway.watchFileDrop).toHaveBeenCalled());

    native.drop(['/dropped.rrd']);

    await vi.waitFor(() => expect(toasts.message()).toBe('the picked files could not be read'));
    expect(store.draft().sources).toEqual([]);
    expect(store.isDialogOpen()).toBe(false);
  });

  it('addDroppedFiles inside the desktop runtime leaves the drop to the native handler and reads nothing', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway)] });
    vi.stubGlobal('go', { desktop: { API: {} } });
    const desktopStore = TestBed.inject(LibraryStore);
    vi.unstubAllGlobals();

    await desktopStore.addDroppedFiles([new File(['RRD'], 'a.rrd')]);

    expect(desktopStore.usesNativeFileDrop).toBe(true);
    expect(gateway.describeFiles).not.toHaveBeenCalled();
    expect(desktopStore.draft().sources).toEqual([]);
    expect(desktopStore.isDialogOpen()).toBe(false);
  });

  it('browseForSources adds the files picked to the draft', async () => {
    store.openDialog();

    await store.browseForSources();

    expect(store.draft().sources).toEqual([{ name: 'picked.rrd', path: '', size: 512 }]);
  });

  it('setDropActive marks a drag held over the drop zone, and opening the dialog clears the mark', () => {
    store.setDropActive(true);
    const isActiveWhileDragging = store.isDropActive();

    store.openDialog();

    expect(isActiveWhileDragging).toBe(true);
    expect(store.isDropActive()).toBe(false);
  });

  it('browseForSources whose picker is cancelled adds nothing and says nothing', async () => {
    vi.mocked(gateway.pickSources).mockResolvedValue([]);
    store.openDialog();

    await store.browseForSources();

    expect(store.draft().sources).toEqual([]);
    expect(toasts.message()).toBeNull();
  });

  it('browseForSources whose files cannot be read says so and adds nothing', async () => {
    vi.mocked(gateway.pickSources).mockRejectedValue(new Error('denied'));
    store.openDialog();

    await store.browseForSources();

    expect(store.draft().sources).toEqual([]);
    expect(toasts.message()).toBe('the picked files could not be read');
  });
});
