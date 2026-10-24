import { computed, Service, signal, untracked } from '@angular/core';

const TOAST_LIFETIME_MILLISECONDS = 2000;
const LASTING_TOAST_LIFETIME_MILLISECONDS = 6000;

type ToastAction = {
  readonly label: string;
  readonly run: () => void;
  readonly otherwise?: () => void;
};

type ShownToast = {
  readonly message: string;
  readonly action: ToastAction | null;
  readonly lifetimeMilliseconds: number;
};

@Service()
export class ToastStore {
  private readonly _shownState = signal<ShownToast | null>(null);
  private readonly _pending: { timer?: ReturnType<typeof setTimeout> } = {};

  public readonly message = computed(() => this._shownState()?.message ?? null);
  public readonly actionLabel = computed(() => this._shownState()?.action?.label ?? null);

  public show(message: string, action: ToastAction | null = null): void {
    this._replaceWith({ message, action, lifetimeMilliseconds: action === null ? TOAST_LIFETIME_MILLISECONDS : LASTING_TOAST_LIFETIME_MILLISECONDS });
  }

  public showFailure(message: string): void {
    this._replaceWith({ message, action: null, lifetimeMilliseconds: LASTING_TOAST_LIFETIME_MILLISECONDS });
  }

  public hold(): void {
    clearTimeout(this._pending.timer);
  }

  public release(): void {
    const shown = untracked(this._shownState);

    if (shown !== null) {
      this._countDown(shown.lifetimeMilliseconds);
    }
  }

  public runAction(): void {
    const action = this._takeAway();

    action?.run();
  }

  public dismiss(): void {
    const action = this._takeAway();

    action?.otherwise?.();
  }

  private _replaceWith(toast: ShownToast): void {
    const replaced = this._takeAway();

    this._shownState.set(toast);
    this._countDown(toast.lifetimeMilliseconds);
    replaced?.otherwise?.();
  }

  private _countDown(lifetimeMilliseconds: number): void {
    clearTimeout(this._pending.timer);
    this._pending.timer = setTimeout(() => this.dismiss(), lifetimeMilliseconds);
  }

  private _takeAway(): ToastAction | null {
    const action = untracked(this._shownState)?.action ?? null;

    clearTimeout(this._pending.timer);
    this._pending.timer = undefined;
    this._shownState.set(null);

    return action;
  }
}
