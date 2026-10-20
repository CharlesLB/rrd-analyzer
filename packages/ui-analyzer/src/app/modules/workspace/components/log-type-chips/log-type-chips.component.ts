import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type TypeChip = {
  readonly name: string;
  readonly count: string;
  readonly color: string;
  readonly isHidden: boolean;
  readonly tip: string;
};

@Component({
  selector: 'app-log-type-chips',
  templateUrl: './log-type-chips.component.html',
  styleUrl: './log-type-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogTypeChipsComponent {
  public readonly chips = input.required<readonly TypeChip[]>();

  public readonly toggled = output<string>();
}
