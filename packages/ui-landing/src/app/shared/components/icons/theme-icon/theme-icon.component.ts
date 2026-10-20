import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-theme-icon',
  templateUrl: './theme-icon.component.html',
  styleUrl: './theme-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeIconComponent {}
