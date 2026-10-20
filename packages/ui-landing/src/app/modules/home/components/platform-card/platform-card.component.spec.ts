import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, elementsOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { downloadsFor, platformReleasesOf } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { PlatformCardComponent } from './platform-card.component';

const RELEASES = platformReleasesOf({ repositoryUrl: 'https://github.com/someone/rrd-analyzer', version: '1.2.3' });

const downloadsOf = (platform: string, visitorPlatform: 'windows' | 'linux' | 'macos') => {
  const downloads = downloadsFor(RELEASES, visitorPlatform).find((release) => release.platform === platform);

  if (downloads === undefined) {
    throw new Error(`no release for ${platform}`);
  }

  return downloads;
};

describe('PlatformCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('names the platform and what it needs, and links every file of it', () => {
    const fixture = renderWithInputs(PlatformCardComponent, { downloads: downloadsOf('linux', 'windows') });

    expect(textOf(fixture, '.platform-card-name')).toBe('Linux');
    expect(textOf(fixture, '.platform-card-requirement')).toBe('x64 · needs GTK 3 and WebKitGTK 4.1');
    expect(textsOf(fixture, '.platform-card-file-label')).toEqual(['Debian, Ubuntu', 'Arch', 'Fedora, other Linux']);
    expect(textsOf(fixture, '.platform-card-file-name')).toEqual([
      'rrd-analyzer_1.2.3_linux_amd64.deb',
      'rrd-analyzer_1.2.3_linux_amd64.pkg.tar.zst',
      'rrd-analyzer_1.2.3_linux_amd64.tar.gz',
    ]);
  });

  it('leaves another platform card plain, with no file filled in', () => {
    const fixture = renderWithInputs(PlatformCardComponent, { downloads: downloadsOf('linux', 'windows') });

    expect(elementOf(fixture, '.platform-card-badge')).toBeNull();
    expect(elementOf(fixture, '.platform-card-file-primary')).toBeNull();
  });

  it('tags the card of the visitor platform and fills in its first file', () => {
    const fixture = renderWithInputs(PlatformCardComponent, { downloads: downloadsOf('windows', 'windows') });

    expect(textOf(fixture, '.platform-card-badge')).toBe('Your system');
    expect(elementOf(fixture, '.platform-card')?.classList.contains('platform-card-visitors')).toBe(true);
    expect(elementsOf(fixture, '.platform-card-file').map((file) => file.classList.contains('platform-card-file-primary'))).toEqual([true, false]);
  });

  it('downloads straight from the link, without opening a new tab', () => {
    const fixture = renderWithInputs(PlatformCardComponent, { downloads: downloadsOf('windows', 'windows') });

    expect(attributeOf(fixture, '.platform-card-file', 'href')).toBe(
      'https://github.com/someone/rrd-analyzer/releases/download/v1.2.3/rrd-analyzer_1.2.3_windows_amd64_installer.exe',
    );
    expect(attributeOf(fixture, '.platform-card-file', 'target')).toBeNull();
  });

  it('tells a Mac that nothing is packaged and points it at building from source', () => {
    const fixture = renderWithInputs(PlatformCardComponent, { downloads: downloadsOf('macos', 'macos') });

    expect(textOf(fixture, '.platform-card-unpackaged')).toContain('macOS build');
    expect(textOf(fixture, '.platform-card-file-label')).toBe('Build from source');
    expect(attributeOf(fixture, '.platform-card-file', 'href')).toBe('https://github.com/CharlesLB/rrd-analyzer#building-it-yourself');
    expect(attributeOf(fixture, '.platform-card-file', 'target')).toBe('_blank');
  });
});
