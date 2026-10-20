import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-external-link-icon',
  templateUrl: './external-link-icon.component.html',
  styleUrl: './external-link-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExternalLinkIconComponent {}
