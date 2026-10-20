import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DesktopWindowStore } from '../../../../stores/desktop-window/store/desktop-window-store/desktop-window.store';
import { isWindowDragRegion } from '../../../utils/window-drag-region/window-drag-region.util';
import { WindowControlsComponent } from '../window-controls/window-controls.component';

@Component({
  selector: 'app-title-bar',
  imports: [WindowControlsComponent],
  templateUrl: './title-bar.component.html',
  styleUrl: './title-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TitleBarComponent {
  private readonly _desktopWindow = inject(DesktopWindowStore);

  protected readonly windowControlsPlatform = this._desktopWindow.windowControlsPlatform;
  protected readonly reservesNativeControls = this._desktopWindow.reservesNativeControls;
  protected readonly isMaximised = this._desktopWindow.isMaximised;

  protected toggleMaximiseFromDragRegion(event: MouseEvent): void {
    if (isWindowDragRegion(event.target)) {
      this._desktopWindow.toggleMaximise();
    }
  }

  protected minimiseWindow(): void {
    this._desktopWindow.minimise();
  }

  protected toggleMaximiseWindow(): void {
    this._desktopWindow.toggleMaximise();
  }

  protected closeWindow(): void {
    void this._desktopWindow.close();
  }
}
