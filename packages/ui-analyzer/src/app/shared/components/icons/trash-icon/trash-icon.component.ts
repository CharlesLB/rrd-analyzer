import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-trash-icon',
  templateUrl: './trash-icon.component.html',
  styleUrl: './trash-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashIconComponent {}
