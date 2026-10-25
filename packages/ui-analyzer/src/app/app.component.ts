import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import { APPLICATION_EDITION } from './core/config/edition.token';
import { BrowserEditionNoticeComponent } from './shared/components/browser-edition-notice/browser-edition-notice.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { carriesFiles } from './shared/utils/drag-transfer/drag-transfer.util';
import { ToastStore } from './stores/toast/store/toast-store/toast.store';

const NO_DROP_EFFECT = 'none';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, BrowserEditionNoticeComponent, ToastComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:dragover)': 'refuseStrayFiles($event)', '(window:drop)': 'refuseStrayFiles($event)' },
})
export class AppComponent {
  private readonly _toasts = inject(ToastStore);

  protected readonly edition = inject(APPLICATION_EDITION);
  protected readonly theme = inject(ThemeStore).theme;
  protected readonly toastMessage = this._toasts.message;
  protected readonly toastActionLabel = this._toasts.actionLabel;

  protected refuseStrayFiles(event: DragEvent): void {
    if (event.defaultPrevented || !carriesFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = NO_DROP_EFFECT;
  }

  protected runToastAction(): void {
    this._toasts.runAction();
  }

  protected dismissToast(): void {
    this._toasts.dismiss();
  }

  protected holdToast(): void {
    this._toasts.hold();
  }

  protected releaseToast(): void {
    this._toasts.release();
  }
}
