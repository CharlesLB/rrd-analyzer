import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MILLISECONDS_PER_MINUTE } from '@rrd-analyzer/shared';
import { SearchFieldComponent } from '../../../../shared/components/search-field/search-field.component';
import { useTickingClock } from '../../../../shared/utils/ticking-clock/ticking-clock.util';
import { BuildStore } from '../../../../stores/build/store/build-store/build.store';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { LibraryStore } from '../../../../stores/library/store/library-store/library.store';
import { SEARCH_FIELDS } from '../../../../stores/search-history/models/search-field/search-field';
import { SearchHistoryStore } from '../../../../stores/search-history/store/search-history-store/search-history.store';
import { type ShareMark, shareMarkOf } from '../../../../stores/sharing/models/share-mark/share-mark';
import { SharedSessionStore } from '../../../../stores/sharing/store/shared-session-store/shared-session.store';
import { SharingStore } from '../../../../stores/sharing/store/sharing-store/sharing.store';
import { AnalysisRowComponent } from '../../components/analysis-row/analysis-row.component';
import { LibraryTopBarComponent } from '../../components/library-top-bar/library-top-bar.component';
import { NewAnalysisCardComponent } from '../../components/new-analysis-card/new-analysis-card.component';
import { NewAnalysisDialogComponent } from '../../components/new-analysis-dialog/new-analysis-dialog.component';
import { analysesNamedLike, isFilterWorthShowing } from '../../models/analysis-filter/analysis-filter';

const WORKSPACE_ROUTE = '/workspace';
const NONE_MISSING: readonly string[] = [];

@Component({
  selector: 'app-library-page',
  imports: [AnalysisRowComponent, LibraryTopBarComponent, NewAnalysisCardComponent, NewAnalysisDialogComponent, SearchFieldComponent],
  templateUrl: './library-page.component.html',
  styleUrl: './library-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:pagehide)': 'settleRemovals()', '(window:focus)': 'checkSources()' },
})
export class LibraryPageComponent {
  private readonly _library = inject(LibraryStore);
  private readonly _router = inject(Router);
  private readonly _build = inject(BuildStore);
  private readonly _searchHistory = inject(SearchHistoryStore);
  private readonly _sharing = inject(SharingStore);
  private readonly _sharedSession = inject(SharedSessionStore);

  protected readonly texts = inject(I18nStore).texts;
  protected readonly workspaceRoute = WORKSPACE_ROUTE;
  protected readonly analyses = this._library.analyses;
  protected readonly missingSources = this._library.missingSources;
  protected readonly noneMissing = NONE_MISSING;
  protected readonly typedFilter = signal('');
  protected readonly filterHistory = computed(() => this._searchHistory.histories()[SEARCH_FIELDS.LIBRARY]);
  protected readonly isFilterShown = computed(() => isFilterWorthShowing(this.analyses()));
  protected readonly shownAnalyses = computed(() => (this.isFilterShown() ? analysesNamedLike(this.analyses(), this.typedFilter()) : this.analyses()));
  protected readonly matchesNothing = computed(() => this.analyses().length > 0 && this.shownAnalyses().length === 0);
  protected readonly isDialogOpen = this._library.isDialogOpen;
  protected readonly hasLoadFailed = this._library.hasLoadFailed;
  protected readonly isReadingFirstTime = computed(() => this._library.isLoading() && this.analyses().length === 0);
  protected readonly isEmpty = computed(() => !this._library.isLoading() && this.analyses().length === 0);
  protected readonly nowMilliseconds = useTickingClock(MILLISECONDS_PER_MINUTE);
  protected readonly version = this._build.summary;

  protected readonly shareMarks = computed<Readonly<Record<string, ShareMark>>>(() => {
    if (!this._sharing.isAvailable()) {
      return {};
    }

    const situation = {
      sessionsByAnalysis: this._sharing.sessionsByAnalysis(),
      followedAnalysisId: this._sharedSession.followedAnalysisId(),
      nowMilliseconds: this.nowMilliseconds(),
    };

    return Object.fromEntries(this.analyses().map((analysis) => [analysis.id, shareMarkOf(analysis.id, situation)]));
  });

  public constructor() {
    void this._library.refresh();
    void this._sharing.load();
    void this._searchHistory.load(SEARCH_FIELDS.LIBRARY);
    const stopWatchingNativeDrops = this._library.watchNativeFileDrop();

    inject(DestroyRef).onDestroy(() => {
      stopWatchingNativeDrops();
      this._library.closeDialog();
      void this._library.settleRemovals();
    });
  }

  protected async readAgain(): Promise<void> {
    await this._library.refresh();
  }

  protected rememberFilter(term: string): void {
    void this._searchHistory.remember(SEARCH_FIELDS.LIBRARY, term);
  }

  protected forgetFilter(term: string): void {
    void this._searchHistory.forget(SEARCH_FIELDS.LIBRARY, term);
  }

  protected startWithDropped(files: readonly File[]): void {
    void this._library.addDroppedFiles(files);
  }

  protected openDialog(): void {
    this._library.openDialog();
  }

  protected remove(analysisId: string): void {
    this._library.remove(analysisId);
  }

  protected checkSources(): void {
    void this._library.checkSources();
  }

  protected settleRemovals(): void {
    void this._library.settleRemovals();
  }

  protected async openCreatedAnalysis(analysisId: string): Promise<void> {
    this._library.closeDialog();
    await this._router.navigate([WORKSPACE_ROUTE, analysisId]);
  }
}
