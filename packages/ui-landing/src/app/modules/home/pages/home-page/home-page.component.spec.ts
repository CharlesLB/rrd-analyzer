import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import { inMemoryStorage, stubSystemTheme } from '@rrd-analyzer/ui-shared/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { HomePageComponent } from './home-page.component';

const LINUX_FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';

describe('HomePageComponent', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', inMemoryStorage());
    stubSystemTheme(false);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lays the sections out in the order the header lists them', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    expect(Array.from(fixture.nativeElement.querySelectorAll('main section[id]'), (section: Element) => section.id)).toEqual([
      'features',
      'demo',
      'download',
      'donate',
    ]);
  });

  it('describes the page for search engines and link previews', () => {
    TestBed.createComponent(HomePageComponent).detectChanges();

    expect(TestBed.inject(Meta).getTag('name="description"')?.content).toContain('round-robin database files');
  });

  it('offers the Windows installer until the page has rendered in a browser and read its platform', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(LINUX_FIREFOX);
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(textOf(fixture, '.hero-download-label')).toBe('Download for Linux');
    expect(textsOf(fixture, '.platform-card-badge')).toEqual(['Your system']);
    expect(textOf(fixture, '.platform-card-visitors .platform-card-name')).toBe('Linux');
  });

  it('switches the theme when the footer asks for it', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    elementOf(fixture, '.site-footer-theme')?.click();

    expect(TestBed.inject(ThemeStore).isDark()).toBe(true);
  });
});
