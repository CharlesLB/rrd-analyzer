import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { SectionHeadingComponent } from './section-heading.component';

describe('SectionHeadingComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('puts the eyebrow above a second-level title', () => {
    const fixture = renderWithInputs(SectionHeadingComponent, { eyebrow: 'Download', title: 'Get RRD Analyzer' });

    expect(textOf(fixture, '.section-heading-eyebrow')).toBe('Download');
    expect(textOf(fixture, 'h2.section-heading-title')).toBe('Get RRD Analyzer');
  });

  it('writes the introduction under the title only when there is one', () => {
    const without = renderWithInputs(SectionHeadingComponent, { eyebrow: 'What it does', title: 'From a folder' });
    const withIntroduction = renderWithInputs(SectionHeadingComponent, { eyebrow: 'Download', title: 'Get it', introduction: 'Pick your platform.' });

    expect(elementOf(without, '.section-heading-introduction')).toBeNull();
    expect(textOf(withIntroduction, '.section-heading-introduction')).toBe('Pick your platform.');
  });
});
