import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, elementsOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { SiteFooterComponent } from './site-footer.component';

describe('SiteFooterComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('states the license and links the repository, its releases and its issues in new tabs', () => {
    const fixture = TestBed.createComponent(SiteFooterComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.site-footer-license')).toBe('Open source · MIT license');
    expect(elementsOf(fixture, '.site-footer-link').map((link) => link.getAttribute('href'))).toEqual([
      'https://github.com/CharlesLB/rrd-analyzer',
      'https://github.com/CharlesLB/rrd-analyzer/releases',
      'https://github.com/CharlesLB/rrd-analyzer/issues',
    ]);
    expect(elementsOf(fixture, '.site-footer-link').every((link) => link.getAttribute('target') === '_blank')).toBe(true);
  });

  it('names the theme button, whose only content is an icon', () => {
    const fixture = TestBed.createComponent(SiteFooterComponent);
    fixture.detectChanges();

    expect(attributeOf(fixture, '.site-footer-theme', 'aria-label')).toBe('Toggle light and dark theme');
  });

  it('asks for the other theme when the theme button is pressed', () => {
    const fixture = TestBed.createComponent(SiteFooterComponent);
    const toggles: unknown[] = [];
    fixture.componentInstance.themeToggled.subscribe((toggle) => toggles.push(toggle));
    fixture.detectChanges();

    elementOf(fixture, '.site-footer-theme')?.click();

    expect(toggles).toHaveLength(1);
  });
});
