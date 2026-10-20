import { ChangeDetectionStrategy, Component, input, linkedSignal, model, output } from '@angular/core';
import {
  type QuickPresetKey,
  type QuickUnit,
  TIMEFRAME_TABS,
  type TimeframeTab,
  type TimeRange,
  type TimestampRange,
} from '../../../../stores/workspace/models/timeframe/timeframe';
import { type AbsoluteDraft, absoluteDraftOf, typedRangeOf } from '../../models/absolute-draft/absolute-draft';
import { AbsoluteRangeComponent } from '../absolute-range/absolute-range.component';
import { QuickSelectComponent } from '../quick-select/quick-select.component';
import { TimeframePopoverComponent } from '../timeframe-popover/timeframe-popover.component';

@Component({
  selector: 'app-timeframe-editor',
  imports: [AbsoluteRangeComponent, QuickSelectComponent, TimeframePopoverComponent],
  templateUrl: './timeframe-editor.component.html',
  styleUrl: './timeframe-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeframeEditorComponent {
  public readonly tab = model.required<TimeframeTab>();
  public readonly quickCount = model.required<string>();
  public readonly quickUnit = model.required<QuickUnit>();
  public readonly window = input.required<TimeRange>();
  public readonly bounds = input.required<TimeRange>();
  public readonly activePresetKey = input.required<QuickPresetKey | undefined>();
  public readonly leftOffset = input.required<number>();
  public readonly isCompact = input.required<boolean>();
  public readonly absoluteNotice = input('');

  public readonly trailingCountApplied = output<void>();
  public readonly presetChosen = output<number>();
  public readonly absoluteApplied = output<TimestampRange>();
  public readonly closeRequested = output<void>();

  protected readonly tabs = TIMEFRAME_TABS;
  protected readonly absoluteDraft = linkedSignal<TimeRange, AbsoluteDraft>({
    source: this.window,
    computation: (window, previous) => absoluteDraftOf(window, previous?.value),
  });

  protected applyAbsolute(): void {
    this.absoluteApplied.emit(typedRangeOf(this.absoluteDraft()));
  }
}
