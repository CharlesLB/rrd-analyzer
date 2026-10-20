import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { attributeOf, elementOf, renderWithInputs, textOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { SCREENSHOTS } from '../../models/screenshots/screenshots.model';
import { FeatureRowComponent } from './feature-row.component';

@Component({
  imports: [FeatureRowComponent],
  template: `<app-feature-row ordinal="02" title="Jump to any window" [screenshot]="screenshot" screenshotDescription="Time window quick select">
    <p class="probe">Pick a range.</p>
  </app-feature-row>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class FeatureRowHostComponent {
  protected readonly screenshot = SCREENSHOTS.TIME_WINDOW;
}

const ROW_INPUTS = { ordinal: '05', title: 'Share what you found', screenshotDescription: 'Exported PNG report' };

describe('FeatureRowComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('numbers and titles the feature, and puts what it is given beside its screenshot', () => {
    const fixture = TestBed.createComponent(FeatureRowHostComponent);
    fixture.detectChanges();

    expect(textOf(fixture, '.feature-row-ordinal')).toBe('02');
    expect(textOf(fixture, 'h3.feature-row-title')).toBe('Jump to any window');
    expect(textOf(fixture, '.feature-row-text .probe')).toBe('Pick a range.');
  });

  it('describes its screenshot, sizes it to stop the page from shifting, and loads it only near the viewport', () => {
    const fixture = renderWithInputs(FeatureRowComponent, { ...ROW_INPUTS, screenshot: SCREENSHOTS.INSIGHTS });

    expect(attributeOf(fixture, '.feature-row-image', 'alt')).toBe('Exported PNG report');
    expect(attributeOf(fixture, '.feature-row-image', 'width')).toBe('924');
    expect(attributeOf(fixture, '.feature-row-image', 'height')).toBe('540');
    expect(attributeOf(fixture, '.feature-row-image', 'loading')).toBe('lazy');
  });

  it('lays a screenshot of a dark report on a dark surround', () => {
    const fixture = renderWithInputs(FeatureRowComponent, { ...ROW_INPUTS, screenshot: SCREENSHOTS.EXPORT });

    expect(elementOf(fixture, '.feature-row-screenshot')?.classList.contains('feature-row-screenshot-dark-surround')).toBe(true);
  });

  it('puts the screenshot first when the row is mirrored', () => {
    const fixture = renderWithInputs(FeatureRowComponent, { ...ROW_INPUTS, screenshot: SCREENSHOTS.LOGS, isMirrored: true });

    expect(elementOf(fixture, '.feature-row')?.classList.contains('feature-row-mirrored')).toBe(true);
  });
});
