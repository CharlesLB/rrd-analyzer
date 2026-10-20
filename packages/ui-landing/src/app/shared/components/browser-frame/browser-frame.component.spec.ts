import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { countOf, elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { BrowserFrameComponent } from './browser-frame.component';

@Component({
  imports: [BrowserFrameComponent],
  template: '<app-browser-frame title="Sample API"><img class="probe" alt="" /></app-browser-frame>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class BrowserFrameHostComponent {}

describe('BrowserFrameComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('draws the three window dots and the title of the window', () => {
    const fixture = renderWithInputs(BrowserFrameComponent, { title: 'Sample API · production' });

    expect(countOf(fixture, '.browser-frame-dot')).toBe(3);
    expect(textOf(fixture, '.browser-frame-title')).toBe('Sample API · production');
  });

  it('centers the title only when asked to', () => {
    const leftAligned = renderWithInputs(BrowserFrameComponent, { title: 'demo' });
    const centered = renderWithInputs(BrowserFrameComponent, { title: 'demo', isTitleCentered: true });

    expect(elementOf(leftAligned, '.browser-frame-title')?.classList.contains('browser-frame-title-centered')).toBe(false);
    expect(elementOf(centered, '.browser-frame-title')?.classList.contains('browser-frame-title-centered')).toBe(true);
  });

  it('frames whatever it is given under its bar', () => {
    const fixture = TestBed.createComponent(BrowserFrameHostComponent);
    fixture.detectChanges();

    expect(elementOf(fixture, '.browser-frame .probe')).not.toBeNull();
  });
});
