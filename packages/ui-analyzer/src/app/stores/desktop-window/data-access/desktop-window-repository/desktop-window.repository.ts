import { Service } from '@angular/core';
import { desktopRuntimeApi } from '../../../../core/gateway/desktop-runtime/desktop-runtime';
import { memberOf } from '../../../../shared/utils/constant-member/constant-member.util';
import { DESKTOP_PLATFORMS, type DesktopPlatform } from '../../models/desktop-platform/desktop-platform';

@Service()
export class DesktopWindowRepository {
  public async platform(): Promise<DesktopPlatform | undefined> {
    const runtime = desktopRuntimeApi();

    if (runtime === undefined) {
      return undefined;
    }

    return memberOf(DESKTOP_PLATFORMS, (await runtime.Environment()).platform);
  }

  public async isMaximised(): Promise<boolean> {
    return (await desktopRuntimeApi()?.WindowIsMaximised()) ?? false;
  }

  public minimise(): void {
    desktopRuntimeApi()?.WindowMinimise();
  }

  public toggleMaximise(): void {
    desktopRuntimeApi()?.WindowToggleMaximise();
  }

  public close(): void {
    desktopRuntimeApi()?.Quit();
  }
}
