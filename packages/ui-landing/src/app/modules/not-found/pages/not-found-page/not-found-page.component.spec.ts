import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { NotFoundPageComponent } from './not-found-page.component';

describe('NotFoundPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('says the page does not exist and leads back to the home page and to the app', () => {
    const fixture = TestBed.createComponent(NotFoundPageComponent);
    fixture.detectChanges();

    expect(textOf(fixture, 'h1')).toBe('This page does not exist.');
    expect(attributeOf(fixture, '.not-found-page-home', 'href')).toBe('/');
    expect(attributeOf(fixture, '.not-found-page-app', 'href')).toBe('app/');
  });

  it('keeps itself out of search results', () => {
    TestBed.createComponent(NotFoundPageComponent).detectChanges();

    const meta = TestBed.inject(Meta);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex');
    expect(meta.getTag('name="description"')?.content).toBe('There is no page of RRD Analyzer at this address.');
  });
});
