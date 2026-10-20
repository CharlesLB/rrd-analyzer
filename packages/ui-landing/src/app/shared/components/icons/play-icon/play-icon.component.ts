import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-play-icon',
  templateUrl: './play-icon.component.html',
  styleUrl: './play-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayIconComponent {}
