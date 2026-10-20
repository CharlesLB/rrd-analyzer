import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, countOf, elementOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { downloadsFor, platformReleasesOf } from '../../../../stores/releases/models/release-catalogue/release-catalogue.model';
import { DownloadSectionComponent } from './download-section.component';

const PLATFORMS = downloadsFor(platformReleasesOf({ repositoryUrl: 'https://github.com/someone/rrd-analyzer', version: '1.2.3' }), 'linux');

describe('DownloadSectionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is the download section the header links to, titled with the version', () => {
    const fixture = renderWithInputs(DownloadSectionComponent, { version: '1.2.3', platforms: PLATFORMS });

    expect(elementOf(fixture, 'section.download-section')?.id).toBe('download');
    expect(textOf(fixture, '.section-heading-title')).toBe('Get RRD Analyzer 1.2.3');
  });

  it('gives every platform a card', () => {
    const fixture = renderWithInputs(DownloadSectionComponent, { version: '1.2.3', platforms: PLATFORMS });

    expect(textsOf(fixture, '.platform-card-name')).toEqual(['Windows', 'Linux', 'macOS']);
  });

  it('lists what is new in the version, with the changelog of that release a new tab away', () => {
    const fixture = renderWithInputs(DownloadSectionComponent, { version: '1.2.3', platforms: PLATFORMS });

    expect(textOf(fixture, '.download-section-card-title')).toBe("What's new in 1.2.3");
    expect(countOf(fixture, '.download-section-note')).toBe(3);
    expect(attributeOf(fixture, '.download-section-changelog', 'target')).toBe('_blank');
  });

  it('offers the releases, the source code and the demo as other ways to get it', () => {
    const fixture = renderWithInputs(DownloadSectionComponent, { version: '1.2.3', platforms: PLATFORMS });

    expect(textsOf(fixture, '.download-section-route').map((route) => route.replace('(opens in a new tab)', ''))).toEqual([
      'All releases and checksums',
      'Source code: build it yourself',
      'Use it in your browser, nothing to install',
    ]);
  });
});
