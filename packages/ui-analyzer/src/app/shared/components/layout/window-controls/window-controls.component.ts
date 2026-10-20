import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DESKTOP_PLATFORMS, type DesktopPlatform } from '../../../../stores/desktop-window/models/desktop-platform/desktop-platform';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { CloseIconComponent } from '../../icons/close-icon/close-icon.component';
import { MaximiseIconComponent } from '../../icons/maximise-icon/maximise-icon.component';
import { MinimiseIconComponent } from '../../icons/minimise-icon/minimise-icon.component';
import { RestoreIconComponent } from '../../icons/restore-icon/restore-icon.component';

@Component({
  selector: 'app-window-controls',
  imports: [CloseIconComponent, MaximiseIconComponent, MinimiseIconComponent, RestoreIconComponent],
  templateUrl: './window-controls.component.html',
  styleUrl: './window-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowControlsComponent {
  public readonly platform = input.required<DesktopPlatform>();
  public readonly isMaximised = input.required<boolean>();

  public readonly minimiseRequested = output<void>();
  public readonly maximiseToggled = output<void>();
  public readonly closeRequested = output<void>();

  protected readonly texts = inject(I18nStore).texts;
  protected readonly isLinux = computed(() => this.platform() === DESKTOP_PLATFORMS.LINUX);
  protected readonly maximiseLabel = computed(() => (this.isMaximised() ? this.texts().windowControls.restore : this.texts().windowControls.maximise));

  protected keepPressFromWindowEdgeResize(event: MouseEvent): void {
    event.stopPropagation();
  }
}
