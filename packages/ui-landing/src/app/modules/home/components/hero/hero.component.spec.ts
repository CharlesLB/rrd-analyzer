import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementsOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { HeroComponent } from './hero.component';

const LINUX_CALL = { label: 'Download for Linux', detail: 'v1.2.3 · Debian, Ubuntu .deb', href: 'https://example.com/package.deb' };

describe('HeroComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('announces the version on the release pill, which leads to the downloads', () => {
    const fixture = renderWithInputs(HeroComponent, { version: '1.2.3', downloadCall: LINUX_CALL });

    expect(textOf(fixture, '.hero-release-version')).toBe('v1.2.3');
    expect(attributeOf(fixture, '.hero-release', 'href')).toBe('#download');
  });

  it('highlights the end of the title, as the design underlines it', () => {
    const fixture = renderWithInputs(HeroComponent, { version: '1.2.3', downloadCall: LINUX_CALL });

    expect(textOf(fixture, 'h1.hero-title')).toBe('See what your servers were doing, minute by minute.');
    expect(textOf(fixture, '.hero-title-highlight')).toBe('minute by minute.');
  });

  it('offers the download it is handed, with its detail line, straight to the file', () => {
    const fixture = renderWithInputs(HeroComponent, { version: '1.2.3', downloadCall: LINUX_CALL });

    expect(textOf(fixture, '.hero-download-label')).toBe('Download for Linux');
    expect(textOf(fixture, '.hero-download-detail')).toBe('v1.2.3 · Debian, Ubuntu .deb');
    expect(attributeOf(fixture, '.hero-download', 'href')).toBe('https://example.com/package.deb');
  });

  it('sends the demo button to the demo section', () => {
    const fixture = renderWithInputs(HeroComponent, { version: '1.2.3', downloadCall: LINUX_CALL });

    expect(attributeOf(fixture, '.hero-demo', 'href')).toBe('#demo');
  });

  it('carries a described screenshot for each theme, the light one fetched first as the largest thing on screen and the dark one only when shown', () => {
    const fixture = renderWithInputs(HeroComponent, { version: '1.2.3', downloadCall: LINUX_CALL });
    const screenshots = elementsOf(fixture, '.hero-screenshot-image');

    expect(screenshots.map((screenshot) => screenshot.getAttribute('src'))).toEqual(['screenshots/workspace.jpg', 'screenshots/workspace-dark.jpg']);
    expect(screenshots.map((screenshot) => [screenshot.getAttribute('loading'), screenshot.getAttribute('fetchpriority')])).toEqual([
      [null, 'high'],
      ['lazy', null],
    ]);
    expect(screenshots.every((screenshot) => (screenshot.getAttribute('alt') ?? '').length > 0)).toBe(true);
  });
});
