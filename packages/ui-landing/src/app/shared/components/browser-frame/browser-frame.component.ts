import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-browser-frame',
  templateUrl: './browser-frame.component.html',
  styleUrl: './browser-frame.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowserFrameComponent {
  public readonly title = input.required<string>();
  public readonly isTitleCentered = input(false);
}
