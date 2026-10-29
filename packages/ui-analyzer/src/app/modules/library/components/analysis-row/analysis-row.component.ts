import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { PressableDirective } from '../../../../shared/directives/pressable/pressable.directive';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import type { Analysis } from '../../../../stores/library/models/analysis/analysis.model';
import { formatRelativeAccess } from '../../models/relative-access/relative-access';
import { SHARE_MARKS, type ShareMark } from '../../models/share-mark/share-mark';

type ShareMarkText = {
  readonly label: string;
  readonly tip: string;
  readonly isOnline: boolean;
};

@Component({
  selector: 'app-analysis-row',
  imports: [PressableDirective, RouterLink],
  templateUrl: './analysis-row.component.html',
  styleUrl: './analysis-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisRowComponent {
  public readonly analysis = input.required<Analysis>();
  public readonly nowMilliseconds = input.required<number>();
  public readonly route = input.required<readonly string[]>();
  public readonly missingSources = input.required<readonly string[]>();
  public readonly shareMark = input.required<ShareMark | null>();

  public readonly removed = output<string>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;

  protected readonly meta = computed(() => {
    const { canvas } = this.analysis();
    const library = this.texts().library;

    if (canvas.length === 0) {
      return library.emptyCanvasMeta;
    }

    const { listSeparator, mergedSeparator } = this.texts().application;

    return formatPlural(library.analysisMeta, canvas.length, {
      labels: R.pipe(
        canvas,
        R.map((chartLabels) => chartLabels.join(mergedSeparator)),
        R.join(listSeparator),
      ),
    });
  });

  protected readonly hasMissingSources = computed(() => this.missingSources().length > 0);
  protected readonly missingSourcesLabel = computed(() => formatPlural(this.texts().library.missingSources, this.missingSources().length));
  protected readonly missingSourcesTip = computed(() =>
    formatMessage(this.texts().library.missingSourcesTip, { files: this.missingSources().join(this.texts().application.listSeparator) }),
  );

  protected readonly shareMarkText = computed<ShareMarkText | null>(() => {
    const mark = this.shareMark();

    return mark === null ? null : this._textOf(mark);
  });

  protected readonly access = computed(() => formatRelativeAccess(this.analysis().lastAccessedMilliseconds, this.nowMilliseconds(), this.texts()));

  protected remove(): void {
    this.removed.emit(this.analysis().id);
  }

  private _textOf(mark: ShareMark): ShareMarkText {
    const marks = this.texts().sharing.marks;

    switch (mark.kind) {
      case SHARE_MARKS.LOCAL:
        return { label: marks.local, tip: marks.localTip, isOnline: false };
      case SHARE_MARKS.FOLLOWING:
        return { label: marks.following, tip: marks.followingTip, isOnline: true };
      case SHARE_MARKS.ONLINE:
        return { label: formatPlural(marks.online, mark.minutesLeft), tip: formatPlural(marks.onlineTip, mark.minutesLeft), isOnline: true };
    }
  }
}
