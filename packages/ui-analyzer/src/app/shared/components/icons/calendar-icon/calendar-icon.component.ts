import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-calendar-icon',
  templateUrl: './calendar-icon.component.html',
  styleUrl: './calendar-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarIconComponent {}
