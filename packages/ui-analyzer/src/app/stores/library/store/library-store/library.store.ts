import { computed, inject, Service, signal } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import type { ValueOf } from '../../../../shared/types/value-of';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { LibraryRepository } from '../../data-access/library-repository/library.repository';
import type { Analysis, NewAnalysisDraft, PendingSource } from '../../models/analysis/analysis.model';
import {
  analysisNameOf,
  EMPTY_NEW_ANALYSIS_DRAFT,
  sourcesNotListed,
  withoutSourceAt,
  withoutSources,
  withSourcesAdded,
} from '../../models/new-analysis-draft/new-analysis-draft';
import { isSupportedSource, pendingSourcesOf } from '../../models/source-file/source-file';

const REMOVAL_STAGES = {
  UNDOABLE: 'undoable',
  DELETING: 'deleting',
} as const;

type RemovalStage = ValueOf<typeof REMOVAL_STAGES>;

type MissingSourceNames = Readonly<Record<string, readonly string[]>>;

const NONE_MISSING: readonly string[] = [];

@Service()
export class LibraryStore {
  private readonly _repository = inject(LibraryRepository);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _analysesState = signal<readonly Analysis[]>([]);
  private readonly _removalsState = signal<Readonly<Record<string, RemovalStage>>>({});
  private readonly _missingSourcesState = signal<MissingSourceNames>({});
  private readonly _isDialogOpenState = signal(false);
  private readonly _isDropActiveState = signal(false);
  private readonly _isLoadingState = signal(false);
  private readonly _hasLoadFailedState = signal(false);
  private readonly _isCreatingState = signal(false);
  private readonly _writes = { count: 0 };
  private readonly _deletionsUnderWay = new Set<Promise<void>>();

  public readonly draft = signal<NewAnalysisDraft>(EMPTY_NEW_ANALYSIS_DRAFT);
  public readonly analyses = computed(() => R.filter(this._analysesState(), (analysis) => this._removalsState()[analysis.id] === undefined));
  public readonly isDialogOpen = this._isDialogOpenState.asReadonly();
  public readonly isDropActive = this._isDropActiveState.asReadonly();
  public readonly isLoading = this._isLoadingState.asReadonly();
  public readonly hasLoadFailed = this._hasLoadFailedState.asReadonly();
  public readonly isCreating = this._isCreatingState.asReadonly();
  public readonly usesNativeFileDrop = this._repository.usesNativeFileDrop;
  public readonly missingSources = this._missingSourcesState.asReadonly();

  public async refresh(): Promise<void> {
    this._isLoadingState.set(true);
    const writesWhenAsked = this._writes.count;

    try {
      const listed = await this._repository.listAnalyses();

      if (this._writes.count !== writesWhenAsked) {
        return await this.refresh();
      }

      this._analysesState.set(listed);
      this._hasLoadFailedState.set(false);
      void this.checkSources();
    } catch {
      this._hasLoadFailedState.set(true);
    } finally {
      this._isLoadingState.set(false);
    }
  }

  public async checkSources(): Promise<void> {
    const checked = await Promise.all(R.map(this._analysesState(), async (analysis) => [analysis.id, await this._missingSourceNamesOf(analysis.id)] as const));

    this._missingSourcesState.set(R.fromEntries(R.filter(checked, ([, names]) => names.length > 0)));
  }

  public renamed(analysisId: string, name: string): void {
    this._writes.count += 1;
    this._analysesState.update((analyses) => {
      const [renamed, others] = R.partition(analyses, (analysis) => analysis.id === analysisId);

      return [...R.map(renamed, (analysis) => ({ ...analysis, name })), ...others];
    });
  }

  public openDialog(): void {
    this._isDialogOpenState.set(true);
    this._isDropActiveState.set(false);
  }

  public discardDraft(): void {
    this.draft.set(EMPTY_NEW_ANALYSIS_DRAFT);
    this.closeDialog();
  }

  public closeDialog(): void {
    this._isDialogOpenState.set(false);
    this._isDropActiveState.set(false);
  }

  public setDropActive(isActive: boolean): void {
    this._isDropActiveState.set(isActive);
  }

  public addSources(candidates: readonly PendingSource[]): void {
    const supported = R.filter(candidates, (candidate) => isSupportedSource(candidate.name));

    const unsupportedCount = candidates.length - supported.length;
    const repeatedCount = supported.length - sourcesNotListed(this.draft(), supported).length;

    if (supported.length === 0) {
      this._toasts.showFailure(this._texts().library.unsupportedSource);

      return;
    }

    this.draft.update((draft) => withSourcesAdded(draft, supported));

    if (unsupportedCount > 0) {
      this._toasts.showFailure(formatPlural(this._texts().library.unsupportedSkipped, unsupportedCount));
    } else if (repeatedCount > 0) {
      this._toasts.show(formatPlural(this._texts().library.sourcesAlreadyListed, repeatedCount));
    }
  }

  public async addDroppedFiles(files: readonly File[]): Promise<void> {
    if (this.usesNativeFileDrop) {
      return;
    }

    const [supported, unsupported] = R.partition(files, (file) => isSupportedSource(file.name));

    if (supported.length === 0) {
      this._takeIn(pendingSourcesOf(unsupported));

      return;
    }

    const described = await this._readSources(this._repository.describeFiles(supported));

    if (described !== null) {
      this._takeIn([...described, ...pendingSourcesOf(unsupported)]);
    }
  }

  public removeSourceAt(index: number): void {
    this.draft.update((draft) => withoutSourceAt(draft, index));
  }

  public clearSources(): void {
    this.draft.update(withoutSources);
  }

  public async browseForSources(): Promise<void> {
    const picked = await this._readSources(this._repository.pickSources());

    if (picked !== null && picked.length > 0) {
      this.addSources(picked);
    }
  }

  public watchNativeFileDrop(): () => void {
    return this._repository.watchFileDrop(async (paths) => {
      this._isDropActiveState.set(false);
      const dropped = await this._readSources(this._repository.describeSources(paths));

      if (dropped !== null) {
        this._takeIn(dropped);
      }
    });
  }

  public async createAnalysis(): Promise<Analysis | null> {
    const draft = this.draft();

    if (draft.sources.length === 0 || this._isCreatingState()) {
      return null;
    }

    this._isCreatingState.set(true);

    try {
      const created = await this._repository.createAnalysis(analysisNameOf(draft, this._texts().library.untitledAnalysis), draft.sources);

      this._writes.count += 1;
      this._analysesState.update((analyses) => [created, ...analyses]);
      this.draft.set(EMPTY_NEW_ANALYSIS_DRAFT);

      return created;
    } catch {
      this._toasts.showFailure(this._texts().library.createFailed);

      return null;
    } finally {
      this._isCreatingState.set(false);
    }
  }

  public remove(analysisId: string): void {
    this._removalsState.update((removals) => ({ ...removals, [analysisId]: REMOVAL_STAGES.UNDOABLE }));

    this._toasts.show(this._texts().library.analysisDeleted, {
      label: this._texts().library.undoDelete,
      run: () => this._bringBack(analysisId),
      otherwise: () => this._follow(this._deleteForGood(analysisId)),
    });
  }

  public async settleRemovals(): Promise<void> {
    if (Object.values(this._removalsState()).includes(REMOVAL_STAGES.UNDOABLE)) {
      this._toasts.dismiss();
    }

    await Promise.all(this._deletionsUnderWay);
  }

  private async _missingSourceNamesOf(analysisId: string): Promise<readonly string[]> {
    try {
      return await this._repository.missingSourceNames(analysisId);
    } catch {
      return NONE_MISSING;
    }
  }

  private _follow(deletion: Promise<void>): void {
    this._deletionsUnderWay.add(deletion);
    void deletion.finally(() => this._deletionsUnderWay.delete(deletion));
  }

  private _takeIn(candidates: readonly PendingSource[]): void {
    if (!this._isDialogOpenState() && candidates.some((candidate) => isSupportedSource(candidate.name))) {
      this.openDialog();
    }

    this.addSources(candidates);
  }

  private _bringBack(analysisId: string): void {
    if (this._removalsState()[analysisId] === REMOVAL_STAGES.UNDOABLE) {
      this._removalsState.update((removals) => R.omit(removals, [analysisId]));
    }
  }

  private async _deleteForGood(analysisId: string): Promise<void> {
    if (this._removalsState()[analysisId] !== REMOVAL_STAGES.UNDOABLE) {
      return;
    }

    this._removalsState.update((removals) => ({ ...removals, [analysisId]: REMOVAL_STAGES.DELETING }));

    try {
      await this._repository.deleteAnalysis(analysisId);
      this._writes.count += 1;
      this._analysesState.update((analyses) => R.filter(analyses, (analysis) => analysis.id !== analysisId));
    } catch {
      this._toasts.showFailure(this._texts().library.deleteFailed);
    } finally {
      this._removalsState.update((removals) => R.omit(removals, [analysisId]));
    }
  }

  private async _readSources(reading: Promise<readonly PendingSource[]>): Promise<readonly PendingSource[] | null> {
    try {
      return await reading;
    } catch {
      this._toasts.showFailure(this._texts().library.sourcesUnreadable);

      return null;
    }
  }
}
