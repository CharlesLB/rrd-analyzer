import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { FocusTrapDirective } from './focus-trap.directive';

@Component({
  selector: 'app-focus-trap-host',
  imports: [FocusTrapDirective],
  template: `
    <button class="opener" type="button">open</button>
    @if (isOpen()) {
      <div class="layer" appFocusTrap>
        <input class="first" />
        <button class="disabled" type="button" disabled>skipped</button>
        <button class="last" type="button">last</button>
      </div>
    }
  `,
})
class FocusTrapHostComponent {
  public readonly isOpen = signal(false);
}

const pressTab = (shiftKey = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });

  (document.activeElement ?? document.body).dispatchEvent(event);

  return event;
};

describe('FocusTrapDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  const renderOpenedFromItsOpener = () => {
    const fixture = TestBed.createComponent(FocusTrapHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    elementOf(fixture, '.opener')?.focus();
    fixture.componentInstance.isOpen.set(true);
    fixture.detectChanges();

    return fixture;
  };

  it('Tab on the last control of the layer goes round to its first, and Shift+Tab on the first to its last', () => {
    const fixture = renderOpenedFromItsOpener();

    elementOf(fixture, '.last')?.focus();
    const forward = pressTab();

    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(elementOf(fixture, '.first'));

    pressTab(true);

    expect(document.activeElement).toBe(elementOf(fixture, '.last'));
  });

  it('Tab between two controls of the layer is left to the browser', () => {
    const fixture = renderOpenedFromItsOpener();

    elementOf(fixture, '.first')?.focus();

    expect(pressTab().defaultPrevented).toBe(false);
  });

  it('Tab pressed while the focus sits behind the layer brings it into the layer', () => {
    const fixture = renderOpenedFromItsOpener();

    pressTab();

    expect(document.activeElement).toBe(elementOf(fixture, '.first'));
  });

  it('hands the focus back to what opened the layer once the layer is gone', () => {
    const fixture = renderOpenedFromItsOpener();
    elementOf(fixture, '.first')?.focus();

    fixture.componentInstance.isOpen.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(elementOf(fixture, '.opener'));
  });
});
