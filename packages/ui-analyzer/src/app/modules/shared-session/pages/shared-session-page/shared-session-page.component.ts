import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { I18nStore } from '../../../../stores/i18n/store/i18n-store/i18n.store';
import { SHARE_FAILURES, type ShareFailure } from '../../../../stores/sharing/models/share-failure/share-failure';
import { SharedSessionStore } from '../../../../stores/sharing/store/shared-session-store/shared-session.store';

type FailureText = {
  readonly title: string;
  readonly detail: string;
  readonly canRetry: boolean;
};

const LIBRARY_ROUTE = '/';
const WORKSPACE_ROUTE = '/workspace';

@Component({
  selector: 'app-shared-session-page',
  templateUrl: './shared-session-page.component.html',
  styleUrl: './shared-session-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedSessionPageComponent {
  public readonly sessionId = input.required<string>();
  public readonly key = input.required<string>();

  private readonly _router = inject(Router);
  private readonly _sharedSession = inject(SharedSessionStore);

  protected readonly texts = inject(I18nStore).texts;

  protected readonly failure = computed<FailureText | null>(() => {
    const failure = this._sharedSession.joinFailure();

    return failure === null || this._sharedSession.isJoining() ? null : this._failureTextOf(failure);
  });

  public constructor() {
    effect(() => {
      const sessionId = this.sessionId();
      const key = this.key();

      untracked(() => void this._join(sessionId, key));
    });
  }

  protected async retry(): Promise<void> {
    await this._join(this.sessionId(), this.key());
  }

  protected async toLibrary(): Promise<void> {
    await this._router.navigateByUrl(LIBRARY_ROUTE, { replaceUrl: true });
  }

  private _failureTextOf(failure: ShareFailure): FailureText {
    const viewer = this.texts().sharing.viewer;
    const retryable: FailureText = { title: viewer.failedTitle, detail: viewer.failedDetail, canRetry: true };

    const texts: Readonly<Record<ShareFailure, FailureText>> = {
      [SHARE_FAILURES.GONE]: { title: viewer.expiredTitle, detail: viewer.expiredDetail, canRetry: false },
      [SHARE_FAILURES.INVALID_LINK]: { title: viewer.invalidTitle, detail: viewer.invalidDetail, canRetry: false },
      [SHARE_FAILURES.TOO_LARGE]: retryable,
      [SHARE_FAILURES.BUSY]: retryable,
      [SHARE_FAILURES.UNREACHABLE]: retryable,
      [SHARE_FAILURES.OTHER]: retryable,
    };

    return texts[failure];
  }

  private async _join(sessionId: string, key: string): Promise<void> {
    const analysisId = await this._sharedSession.join(sessionId, key);

    if (analysisId !== null) {
      await this._router.navigate([WORKSPACE_ROUTE, analysisId], { replaceUrl: true });
    }
  }
}
