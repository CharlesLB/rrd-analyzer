import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Screenshot } from '../../models/screenshots/screenshots.model';

@Component({
  selector: 'app-feature-row',
  templateUrl: './feature-row.component.html',
  styleUrl: './feature-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureRowComponent {
  public readonly ordinal = input.required<string>();
  public readonly title = input.required<string>();
  public readonly screenshot = input.required<Screenshot>();
  public readonly screenshotDescription = input.required<string>();
  public readonly isMirrored = input(false);
}
