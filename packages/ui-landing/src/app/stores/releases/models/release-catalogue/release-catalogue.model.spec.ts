import { describe, expect, it } from 'vitest';
import { downloadsFor, platformReleasesOf, primaryDownloadOf } from './release-catalogue.model';

const SOURCE = { repositoryUrl: 'https://github.com/someone/rrd-analyzer', version: '1.2.3' };

describe('platformReleasesOf', () => {
  it('lists Windows, then Linux, then macOS', () => {
    expect(platformReleasesOf(SOURCE).map((release) => release.platform)).toEqual(['windows', 'linux', 'macos']);
  });

  it('names every file the way the release pipeline does, with the version in it', () => {
    const fileNames = platformReleasesOf(SOURCE).flatMap((release) => release.files.map((file) => file.fileName));

    expect(fileNames).toEqual([
      'rrd-analyzer_1.2.3_windows_amd64_installer.exe',
      'rrd-analyzer_1.2.3_windows_amd64.zip',
      'rrd-analyzer_1.2.3_linux_amd64.deb',
      'rrd-analyzer_1.2.3_linux_amd64.pkg.tar.zst',
      'rrd-analyzer_1.2.3_linux_amd64.tar.gz',
    ]);
  });

  it('links each file to the release tagged with its version, so the link outlives a newer release', () => {
    const [windows] = platformReleasesOf(SOURCE);

    expect(windows?.files[0]?.url).toBe('https://github.com/someone/rrd-analyzer/releases/download/v1.2.3/rrd-analyzer_1.2.3_windows_amd64_installer.exe');
  });

  it('offers no file for macOS, which is not packaged', () => {
    const macos = platformReleasesOf(SOURCE).find((release) => release.platform === 'macos');

    expect(macos?.files).toEqual([]);
  });
});

describe('downloadsFor', () => {
  it('marks the platform of the visitor, and only that one', () => {
    const downloads = downloadsFor(platformReleasesOf(SOURCE), 'linux');

    expect(downloads.map((platform) => platform.isVisitors)).toEqual([false, true, false]);
  });
});

describe('primaryDownloadOf', () => {
  it('offers the first file of the visitor platform', () => {
    const primary = primaryDownloadOf(platformReleasesOf(SOURCE), 'linux');

    expect(primary.platform).toBe('linux');
    expect(primary.file?.extension).toBe('.deb');
  });

  it('offers no file to a visitor on a platform with nothing to download', () => {
    expect(primaryDownloadOf(platformReleasesOf(SOURCE), 'macos').file).toBeNull();
  });
});
