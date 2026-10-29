import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { DemoSectionComponent } from './demo-section.component';

describe('DemoSectionComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is the demo section the header links to', () => {
    const fixture = TestBed.createComponent(DemoSectionComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'section.demo-section')?.id).toBe('demo');
  });

  it('opens the app that runs in the browser, in this same tab, from the poster and from the small screen notice', () => {
    const fixture = TestBed.createComponent(DemoSectionComponent);
    fixture.detectChanges();

    expect(attributeOf(fixture, '.demo-section-poster', 'href')).toBe('app/');
    expect(attributeOf(fixture, '.demo-section-poster', 'target')).toBeNull();
    expect(attributeOf(fixture, '.demo-section-notice-open', 'href')).toBe('app/');
    expect(textOf(fixture, '.demo-section-open')).toBe('Open RRD Analyzer in your browser');
  });

  it('says plainly that nothing is uploaded or kept on a server, and that everything is erased with the tab', () => {
    const fixture = TestBed.createComponent(DemoSectionComponent);
    fixture.detectChanges();

    const points = textsOf(fixture, '.demo-section-privacy-body').join(' ');

    expect(textsOf(fixture, '.demo-section-privacy-title')).toEqual([
      'Nothing leaves your computer unless you share it',
      'Gone when you close the tab',
      'Prefer it offline?',
    ]);
    expect(points).toContain('nothing is saved on our servers');
    expect(points).toContain('erased as soon as you close or reload it');
  });

  it('offers the desktop app, which works offline, through the download section', () => {
    const fixture = TestBed.createComponent(DemoSectionComponent);
    fixture.detectChanges();

    expect(textsOf(fixture, '.demo-section-privacy-body')).toContain('The desktop app works 100% offline and keeps your analyses between sessions.');
    expect(attributeOf(fixture, '.demo-section-offline', 'href')).toBe('#download');
  });

  it('loads no app inside the landing page itself', () => {
    const fixture = TestBed.createComponent(DemoSectionComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, 'iframe')).toBeNull();
  });
});
