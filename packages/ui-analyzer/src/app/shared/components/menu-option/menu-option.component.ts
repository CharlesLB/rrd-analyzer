import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-menu-option',
  templateUrl: './menu-option.component.html',
  styleUrl: './menu-option.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuOptionComponent {
  public readonly tag = input.required<string>();
  public readonly heading = input.required<string>();
  public readonly detail = input.required<string>();
  public readonly chosen = output<void>();
}
