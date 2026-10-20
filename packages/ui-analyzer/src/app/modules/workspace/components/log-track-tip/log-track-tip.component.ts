import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TrackTip = {
  readonly left: string;
  readonly shift: string;
  readonly color: string;
  readonly type: string;
  readonly time: string;
  readonly message: string;
  readonly more: string;
};

@Component({
  selector: 'app-log-track-tip',
  templateUrl: './log-track-tip.component.html',
  styleUrl: './log-track-tip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogTrackTipComponent {
  public readonly tip = input.required<TrackTip>();
}
