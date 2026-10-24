import type { ValueOf } from '../../../../shared/types/value-of';
import { PLATFORMS, type Platform } from '../platform/platform.model';

const RELEASE_FILE_KINDS = {
  WINDOWS_INSTALLER: 'windowsInstaller',
  WINDOWS_PORTABLE: 'windowsPortable',
  DEBIAN_PACKAGE: 'debianPackage',
  ARCH_PACKAGE: 'archPackage',
  LINUX_ARCHIVE: 'linuxArchive',
} as const;

type ReleaseFileKind = ValueOf<typeof RELEASE_FILE_KINDS>;

type ReleaseSource = {
  readonly repositoryUrl: string;
  readonly version: string;
};

export type ReleaseFile = {
  readonly kind: ReleaseFileKind;
  readonly fileName: string;
  readonly extension: string;
  readonly url: string;
};

type PlatformRelease = {
  readonly platform: Platform;
  readonly files: readonly ReleaseFile[];
};

export type PlatformDownloads = PlatformRelease & {
  readonly isVisitors: boolean;
};

export type PrimaryDownload = {
  readonly platform: Platform;
  readonly file: ReleaseFile | null;
};

type ReleaseArtifact = {
  readonly kind: ReleaseFileKind;
  readonly target: string;
  readonly extension: string;
};

const PROJECT_NAME = 'rrd-analyzer';
const RELEASE_DOWNLOAD_PATH = 'releases/download';
const RELEASE_TAG_PREFIX = 'v';
const LINUX_TARGET = 'linux_amd64';

const ARTIFACTS_BY_PLATFORM: Readonly<Record<Platform, readonly ReleaseArtifact[]>> = {
  [PLATFORMS.WINDOWS]: [
    { kind: RELEASE_FILE_KINDS.WINDOWS_INSTALLER, target: 'windows_amd64_installer', extension: '.exe' },
    { kind: RELEASE_FILE_KINDS.WINDOWS_PORTABLE, target: 'windows_amd64', extension: '.zip' },
  ],
  [PLATFORMS.LINUX]: [
    { kind: RELEASE_FILE_KINDS.DEBIAN_PACKAGE, target: LINUX_TARGET, extension: '.deb' },
    { kind: RELEASE_FILE_KINDS.ARCH_PACKAGE, target: LINUX_TARGET, extension: '.pkg.tar.zst' },
    { kind: RELEASE_FILE_KINDS.LINUX_ARCHIVE, target: LINUX_TARGET, extension: '.tar.gz' },
  ],
  [PLATFORMS.MACOS]: [],
};

const PLATFORM_ORDER: readonly Platform[] = [PLATFORMS.WINDOWS, PLATFORMS.LINUX, PLATFORMS.MACOS];

const releaseFileOf = (source: ReleaseSource, artifact: ReleaseArtifact): ReleaseFile => {
  const fileName = `${PROJECT_NAME}_${source.version}_${artifact.target}${artifact.extension}`;

  return {
    kind: artifact.kind,
    fileName,
    extension: artifact.extension,
    url: `${source.repositoryUrl}/${RELEASE_DOWNLOAD_PATH}/${RELEASE_TAG_PREFIX}${source.version}/${fileName}`,
  };
};

export const platformReleasesOf = (source: ReleaseSource): readonly PlatformRelease[] =>
  PLATFORM_ORDER.map((platform) => ({ platform, files: ARTIFACTS_BY_PLATFORM[platform].map((artifact) => releaseFileOf(source, artifact)) }));

export const downloadsFor = (releases: readonly PlatformRelease[], visitorPlatform: Platform): readonly PlatformDownloads[] =>
  releases.map((release) => ({ ...release, isVisitors: release.platform === visitorPlatform }));

export const primaryDownloadOf = (releases: readonly PlatformRelease[], visitorPlatform: Platform): PrimaryDownload => ({
  platform: visitorPlatform,
  file: releases.find((release) => release.platform === visitorPlatform)?.files.at(0) ?? null,
});
