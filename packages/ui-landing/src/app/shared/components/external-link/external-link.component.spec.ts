import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { ExternalLinkComponent } from './external-link.component';

@Component({
  imports: [ExternalLinkComponent],
  template: '<a class="probe" appExternalLink href="https://example.com">Releases</a>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ExternalLinkHostComponent {}

describe('ExternalLinkComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('opens the page in a new tab without handing it a reference back to this one', () => {
    const fixture = TestBed.createComponent(ExternalLinkHostComponent);
    fixture.detectChanges();

    expect(attributeOf(fixture, '.probe', 'target')).toBe('_blank');
    expect(attributeOf(fixture, '.probe', 'rel')).toBe('noopener');
  });

  it('keeps the text it was given and tells a screen reader the link opens a new tab', () => {
    const fixture = TestBed.createComponent(ExternalLinkHostComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.probe')).toBe('Releases(opens in a new tab)');
    expect(textOf(fixture, '.probe .app-visually-hidden')).toBe('(opens in a new tab)');
  });
});
