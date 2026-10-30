import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { formatPlural } from '@rrd-analyzer/shared';
import { GLYPHS } from '../../../../shared/constants/glyphs';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { SHARE_MARKS, shareMarkTextOf } from '../../../../stores/sharing/models/share-mark/share-mark';

@Component({
  selector: 'app-share-trigger',
  templateUrl: './share-trigger.component.html',
  styleUrl: './share-trigger.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareTriggerComponent {
  public readonly minutesLeft = input.required<number | null>();
  public readonly isBusy = input.required<boolean>();
  public readonly isCompact = input.required<boolean>();

  public readonly requested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly glyphs = GLYPHS;

  protected readonly live = computed(() => {
    const minutesLeft = this.minutesLeft();
    const sharing = this.texts().sharing;

    return minutesLeft === null
      ? null
      : { tip: formatPlural(sharing.liveTip, minutesLeft), label: shareMarkTextOf({ kind: SHARE_MARKS.ONLINE, minutesLeft }, sharing.marks).label };
  });
}
