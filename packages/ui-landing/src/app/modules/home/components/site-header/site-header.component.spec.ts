import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { SiteHeaderComponent } from './site-header.component';

const WINDOWS_CALL = { label: 'Download for Windows', detail: 'v1.2.3 · Installer .exe', href: 'https://example.com/installer.exe' };

describe('SiteHeaderComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('links every section of the page in order, and the repository in a new tab', () => {
    const fixture = renderWithInputs(SiteHeaderComponent, { downloadCall: WINDOWS_CALL });

    expect(textsOf(fixture, '.site-header-link')).toEqual(['Features', 'Demo', 'Download', 'Donate']);
    expect(attributeOf(fixture, '.site-header-link', 'href')).toBe('#features');
    expect(attributeOf(fixture, '.site-header-github', 'href')).toBe('https://github.com/CharlesLB/rrd-analyzer');
    expect(attributeOf(fixture, '.site-header-github', 'target')).toBe('_blank');
  });

  it('keeps the menu closed until its button is pressed, and says so to a screen reader', () => {
    const fixture = renderWithInputs(SiteHeaderComponent, { downloadCall: WINDOWS_CALL });
    const button = elementOf(fixture, '.site-header-menu-button');

    expect(elementOf(fixture, '.site-header-menu')).toBeNull();
    expect(button?.getAttribute('aria-expanded')).toBe('false');

    button?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.site-header-menu')).not.toBeNull();
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(button?.getAttribute('aria-controls')).toBe(elementOf(fixture, '.site-header-menu')?.id);
  });

  it('offers the download of the visitor platform at the end of the open menu', () => {
    const fixture = renderWithInputs(SiteHeaderComponent, { downloadCall: WINDOWS_CALL });

    elementOf(fixture, '.site-header-menu-button')?.click();
    fixture.detectChanges();

    expect(textOf(fixture, '.site-header-menu-download')).toBe('Download for Windows');
    expect(attributeOf(fixture, '.site-header-menu-download', 'href')).toBe('https://example.com/installer.exe');
  });

  it('closes the menu once one of its links is followed, so the section is not hidden under it', () => {
    const fixture = renderWithInputs(SiteHeaderComponent, { downloadCall: WINDOWS_CALL });
    elementOf(fixture, '.site-header-menu-button')?.click();
    fixture.detectChanges();

    elementOf(fixture, '.site-header-menu-link')?.click();
    fixture.detectChanges();

    expect(elementOf(fixture, '.site-header-menu')).toBeNull();
  });

  it('closes the menu on Escape', () => {
    const fixture = renderWithInputs(SiteHeaderComponent, { downloadCall: WINDOWS_CALL });
    elementOf(fixture, '.site-header-menu-button')?.click();
    fixture.detectChanges();

    elementOf(fixture, '.site-header-menu')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(elementOf(fixture, '.site-header-menu')).toBeNull();
  });
});
