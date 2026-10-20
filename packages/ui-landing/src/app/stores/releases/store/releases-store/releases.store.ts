import { computed, DOCUMENT, inject, Service, signal } from '@angular/core';
import { LANDING_CONFIGURATION } from '../../../../core/config/landing.config';
import { DEFAULT_PLATFORM, type Platform } from '../../models/platform/platform.model';
import { downloadsFor, platformReleasesOf, primaryDownloadOf } from '../../models/release-catalogue/release-catalogue.model';
import { platformOfUserAgent } from '../../models/visitor-platform/visitor-platform.model';

const UNKNOWN_USER_AGENT = '';

@Service()
export class ReleasesStore {
  private readonly _browserWindow = inject(DOCUMENT).defaultView;
  private readonly _releases = platformReleasesOf({ repositoryUrl: LANDING_CONFIGURATION.repositoryUrl, version: LANDING_CONFIGURATION.releaseVersion });
  private readonly _visitorPlatformState = signal<Platform>(DEFAULT_PLATFORM);

  public readonly version = LANDING_CONFIGURATION.releaseVersion;
  public readonly visitorPlatform = this._visitorPlatformState.asReadonly();
  public readonly platforms = computed(() => downloadsFor(this._releases, this._visitorPlatformState()));
  public readonly primaryDownload = computed(() => primaryDownloadOf(this._releases, this._visitorPlatformState()));

  public detectVisitorPlatform(): void {
    this._visitorPlatformState.set(platformOfUserAgent(this._browserWindow?.navigator.userAgent ?? UNKNOWN_USER_AGENT));
  }
}
