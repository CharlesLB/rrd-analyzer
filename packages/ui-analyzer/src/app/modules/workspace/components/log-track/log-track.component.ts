import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { formatMessage } from '@rrd-analyzer/shared';
import * as R from 'remeda';
import { formatCount } from '../../../../shared/utils/count-format/count-format.util';
import { formatTimestampWithSeconds } from '../../../../shared/utils/date-format/date-format.util';
import { percentOf } from '../../../../shared/utils/percent/percent.util';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { colorOfType, type TypeColors } from '../../../../stores/logs/models/log-severity/log-severity';
import { LOG_STATUSES, type LogStatus } from '../../../../stores/logs/models/log-state/log-state';
import type { LogEntry, TypeCount } from '../../../../stores/logs/models/log-timeline/log-timeline';
import type { TimeRange } from '../../../../stores/workspace/models/timeframe/timeframe';
import type { LogMark } from '../../models/log-mark/log-mark';
import { groupHoldingEntry, groupWithKey, logTrackOf, type TrackGroup, tipShiftOf } from '../../models/log-track/log-track';
import { TRACK_ACTIONS, type TrackAction, trackNoticeOf } from '../../models/log-track-notice/log-track-notice';
import { LogTrackTipComponent, type TrackTip } from '../log-track-tip/log-track-tip.component';
import { LogTypeChipsComponent, type TypeChip } from '../log-type-chips/log-type-chips.component';

const MARK_POSITION_DECIMALS = 3;
const ONE_ENTRY = 1;

@Component({
  selector: 'app-log-track',
  imports: [LogTrackTipComponent, LogTypeChipsComponent],
  templateUrl: './log-track.component.html',
  styleUrl: './log-track.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogTrackComponent {
  public readonly status = input.required<LogStatus>();
  public readonly fileName = input.required<string>();
  public readonly failureTitle = input.required<string>();
  public readonly recordCount = input.required<number>();
  public readonly isSetupOpen = input.required<boolean>();
  public readonly entries = input.required<readonly LogEntry[]>();
  public readonly types = input.required<readonly TypeCount[]>();
  public readonly typeColors = input.required<TypeColors>();
  public readonly hiddenTypes = input.required<ReadonlySet<string>>();
  public readonly span = input.required<TimeRange | null>();
  public readonly window = input.required<TimeRange>();
  public readonly bounds = input.required<TimeRange>();
  public readonly cursorFraction = input.required<number | null>();
  public readonly marks = input.required<readonly LogMark[]>();
  public readonly selectedIndex = input.required<number | null>();
  public readonly isSingleLane = input.required<boolean>();

  public readonly typeToggled = output<string>();
  public readonly allTypesShown = output<void>();
  public readonly setupRequested = output<void>();
  public readonly jumpRequested = output<void>();
  public readonly entryHovered = output<number | null>();
  public readonly entrySelected = output<number>();

  private readonly _hoveredKeyState = signal<string | null>(null);

  private readonly _noticeActions: Readonly<Record<TrackAction, () => void>> = {
    [TRACK_ACTIONS.OPEN_SETUP]: () => this.setupRequested.emit(),
    [TRACK_ACTIONS.SHOW_ALL_TYPES]: () => this.allTypesShown.emit(),
    [TRACK_ACTIONS.JUMP_TO_LOGS]: () => this.jumpRequested.emit(),
  };

  protected readonly texts = inject(I18nStore).texts;
  protected readonly hasLoadedFile = computed(() => this.status() === LOG_STATUSES.SETUP || this.status() === LOG_STATUSES.READY);

  private readonly _shownTypes = computed(() =>
    R.pipe(
      this.types(),
      R.map((type) => type.name),
      R.filter((name) => !this.hiddenTypes().has(name)),
    ),
  );

  private readonly _track = computed(() =>
    logTrackOf({
      entries: this.entries(),
      window: this.window(),
      shownTypes: this._shownTypes(),
      hiddenTypes: this.hiddenTypes(),
      colors: this.typeColors(),
      isSingleLane: this.isSingleLane(),
      singleLaneName: this.texts().logs.track.allTypes,
    }),
  );

  private readonly _hoveredGroup = computed(() => groupWithKey(this._track(), this._hoveredKeyState()));
  private readonly _hoveredEntryIndex = computed(() => this._hoveredGroup()?.lead.index ?? null);

  protected readonly chips = computed<readonly TypeChip[]>(() => {
    const texts = this.texts().logs.track;

    return R.map(this.types(), (type) => {
      const isHidden = this.hiddenTypes().has(type.name);

      return {
        name: type.name,
        count: formatCount(type.count),
        color: colorOfType(this.typeColors(), type.name),
        isHidden,
        tip: formatMessage(isHidden ? texts.showType : texts.hideType, { type: type.name }),
      };
    });
  });

  protected readonly notice = computed(() =>
    trackNoticeOf(
      {
        status: this.status(),
        fileName: this.fileName(),
        failureTitle: this.failureTitle(),
        recordCount: this.recordCount(),
        isSetupOpen: this.isSetupOpen(),
        shownTypeCount: this._shownTypes().length,
        inViewCount: this._track().inViewCount,
        span: this.span(),
        bounds: this.bounds(),
      },
      this.texts().logs.track,
    ),
  );

  protected readonly inViewLabel = computed(() =>
    this.status() === LOG_STATUSES.READY ? formatMessage(this.texts().logs.track.inView, { count: formatCount(this._track().inViewCount) }) : '',
  );

  protected readonly hoveredKey = this._hoveredKeyState.asReadonly();
  protected readonly selectedKey = computed(() => groupHoldingEntry(this._track(), this.selectedIndex())?.key ?? null);

  protected readonly lanes = computed(() =>
    R.map(this._track().lanes, (lane) => ({
      name: lane.name,
      color: lane.color,
      markers: R.map(lane.groups, (group) => ({
        group,
        left: percentOf(group.fraction, MARK_POSITION_DECIMALS),
        label: `${group.lead.type} ${formatTimestampWithSeconds(group.lead.timeMilliseconds)}`,
        isGrouped: group.entryIndexes.length > ONE_ENTRY,
      })),
    })),
  );

  protected readonly markLines = computed(() =>
    R.map(this.marks(), (mark) => ({ left: percentOf(mark.fraction, MARK_POSITION_DECIMALS), color: mark.color, isSelected: mark.isSelected })),
  );

  protected readonly cursorLeft = computed(() => {
    const fraction = this.cursorFraction();

    return fraction === null ? null : percentOf(fraction);
  });

  protected readonly tip = computed<TrackTip | null>(() => {
    const group = this._hoveredGroup();

    if (group === null) {
      return null;
    }

    const moreCount = group.entryIndexes.length - ONE_ENTRY;

    return {
      left: percentOf(group.fraction),
      shift: tipShiftOf(group.fraction),
      color: group.color,
      type: group.lead.type,
      time: formatTimestampWithSeconds(group.lead.timeMilliseconds),
      message: group.lead.message,
      more: moreCount > 0 ? formatMessage(this.texts().logs.track.moreHere, { count: formatCount(moreCount) }) : '',
    };
  });

  public constructor() {
    effect(() => this.entryHovered.emit(this._hoveredEntryIndex()));
  }

  protected performNoticeAction(action: TrackAction): void {
    this._noticeActions[action]();
  }

  protected hoverGroup(group: TrackGroup | null): void {
    this._hoveredKeyState.set(group?.key ?? null);
  }

  protected selectGroup(group: TrackGroup): void {
    const selectedIndex = this.selectedIndex();

    this.entrySelected.emit(selectedIndex !== null && group.entryIndexes.includes(selectedIndex) ? selectedIndex : group.lead.index);
  }
}
