import { computed, DestroyRef, inject, Service, signal } from '@angular/core';
import { LibraryStore } from '../../../library/store/library-store/library.store';
import { DesktopWindowRepository } from '../../data-access/desktop-window-repository/desktop-window.repository';
import { DESKTOP_PLATFORMS, type DesktopPlatform } from '../../models/desktop-platform/desktop-platform';

const RESIZE_EVENT = 'resize';
const MAXIMISED_CHECK_DELAY_MILLISECONDS = 120;
const LONGEST_WAIT_BEFORE_CLOSING_MILLISECONDS = 3000;
const PLATFORMS_WITH_DRAWN_CONTROLS: readonly DesktopPlatform[] = [DESKTOP_PLATFORMS.WINDOWS, DESKTOP_PLATFORMS.LINUX];

const waitedOut = async (milliseconds: number): Promise<void> => await new Promise((resolve) => setTimeout(resolve, milliseconds));

@Service()
export class DesktopWindowStore {
  private readonly _repository = inject(DesktopWindowRepository);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _library = inject(LibraryStore);

  private readonly _platformState = signal<DesktopPlatform | undefined>(undefined);
  private readonly _maximisedState = signal(false);
  private readonly _pending: { maximisedCheck?: ReturnType<typeof setTimeout> } = {};

  public readonly isMaximised = this._maximisedState.asReadonly();
  public readonly windowControlsPlatform = computed(() => PLATFORMS_WITH_DRAWN_CONTROLS.find((platform) => platform === this._platformState()));
  public readonly reservesNativeControls = computed(() => this._platformState() === DESKTOP_PLATFORMS.MAC_OS);

  public constructor() {
    void this._load();
  }

  public minimise(): void {
    this._repository.minimise();
  }

  public toggleMaximise(): void {
    this._repository.toggleMaximise();
  }

  public async close(): Promise<void> {
    await Promise.race([this._library.settleRemovals(), waitedOut(LONGEST_WAIT_BEFORE_CLOSING_MILLISECONDS)]);
    this._repository.close();
  }

  private async _load(): Promise<void> {
    const platform = await this._readPlatform();

    if (platform === undefined) {
      return;
    }

    this._platformState.set(platform);
    this._followMaximisedState();
    await this._refreshMaximised();
  }

  private _followMaximisedState(): void {
    const scheduleMaximisedCheck = (): void => {
      clearTimeout(this._pending.maximisedCheck);
      this._pending.maximisedCheck = setTimeout(() => void this._refreshMaximised(), MAXIMISED_CHECK_DELAY_MILLISECONDS);
    };

    globalThis.addEventListener(RESIZE_EVENT, scheduleMaximisedCheck);
    this._destroyRef.onDestroy(() => {
      globalThis.removeEventListener(RESIZE_EVENT, scheduleMaximisedCheck);
      clearTimeout(this._pending.maximisedCheck);
    });
  }

  private async _readPlatform(): Promise<DesktopPlatform | undefined> {
    try {
      return await this._repository.platform();
    } catch {
      return undefined;
    }
  }

  private async _refreshMaximised(): Promise<void> {
    try {
      this._maximisedState.set(await this._repository.isMaximised());
    } catch {
      return;
    }
  }
}
