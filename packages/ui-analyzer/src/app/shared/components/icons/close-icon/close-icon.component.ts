import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-close-icon',
  templateUrl: './close-icon.component.html',
  styleUrl: './close-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloseIconComponent {}
