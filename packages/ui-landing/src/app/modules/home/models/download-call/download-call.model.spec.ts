import { describe, expect, it } from 'vitest';
import { ENGLISH_MESSAGES } from '../../../../stores/i18n/models/english-messages/english.messages';
import { platformReleasesOf, primaryDownloadOf } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { downloadCallOf } from './download-call.model';

const RELEASES = platformReleasesOf({ repositoryUrl: 'https://github.com/someone/rrd-analyzer', version: '1.2.3' });

describe('downloadCallOf', () => {
  it('asks a Windows visitor to download the installer, naming the version and the file type', () => {
    const call = downloadCallOf(primaryDownloadOf(RELEASES, 'windows'), '1.2.3', ENGLISH_MESSAGES);

    expect(call.label).toBe('Download for Windows');
    expect(call.detail).toBe('v1.2.3 · Installer .exe');
    expect(call.href).toBe('https://github.com/someone/rrd-analyzer/releases/download/v1.2.3/rrd-analyzer_1.2.3_windows_amd64_installer.exe');
  });

  it('asks a Linux visitor to download the Debian package', () => {
    const call = downloadCallOf(primaryDownloadOf(RELEASES, 'linux'), '1.2.3', ENGLISH_MESSAGES);

    expect(call.label).toBe('Download for Linux');
    expect(call.detail).toBe('v1.2.3 · Debian, Ubuntu .deb');
  });

  it('sends a Mac visitor, who has nothing to download, to the download section instead of a file', () => {
    const call = downloadCallOf(primaryDownloadOf(RELEASES, 'macos'), '1.2.3', ENGLISH_MESSAGES);

    expect(call.label).toBe('Get RRD Analyzer');
    expect(call.detail).toBe('v1.2.3 · Windows and Linux');
    expect(call.href).toBe('#download');
  });
});
