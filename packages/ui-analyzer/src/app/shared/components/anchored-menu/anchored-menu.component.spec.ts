import { Component, Directive, ElementRef, inject, type OnInit, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs } from '../../utils/component-fixture/component-fixture.fixture';
import { AnchoredMenuComponent } from './anchored-menu.component';

describe('AnchoredMenuComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('is fixed where it was placed, as wide as it is asked to be', () => {
    const menu = elementOf(renderWithInputs(AnchoredMenuComponent, { placement: { top: 100, bottom: null, right: 46 }, width: 254 }), '.anchored-menu');

    expect(menu?.style.top).toBe('100px');
    expect(menu?.style.bottom).toBe('');
    expect(menu?.style.right).toBe('46px');
    expect(menu?.style.width).toBe('254px');
  });

  it('opens upward from its anchor when placed by its bottom edge', () => {
    const menu = elementOf(renderWithInputs(AnchoredMenuComponent, { placement: { top: null, bottom: 170, right: 44 }, width: 330 }), '.anchored-menu');

    expect(menu?.style.top).toBe('');
    expect(menu?.style.bottom).toBe('170px');
  });

  it('asks to close when its backdrop is clicked', () => {
    const fixture = renderWithInputs(AnchoredMenuComponent, { placement: { top: 100, bottom: null, right: 46 }, width: 254 });
    const closed = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closed);

    elementOf(fixture, '.anchored-menu-backdrop')?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });
});

@Component({
  selector: 'app-anchored-menu-host',
  imports: [AnchoredMenuComponent],
  template: `
    <button class="opener" type="button">open</button>
    @if (isOpen()) {
      <app-anchored-menu [placement]="placement" [width]="200" (closeRequested)="isOpen.set(false)">
        <button class="first" type="button">first</button>
        <input class="field" />
        <button class="last" type="button">last</button>
      </app-anchored-menu>
    }
  `,
})
class AnchoredMenuHostComponent {
  public readonly isOpen = signal(false);
  public readonly placement = { top: 10, bottom: null, right: 10 };
}

@Directive({ selector: '[appFocusOnInit]' })
class FocusOnInitDirective implements OnInit {
  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef);

  public ngOnInit(): void {
    this._element.nativeElement.focus();
  }
}

@Component({
  selector: 'app-anchored-menu-with-field-host',
  imports: [AnchoredMenuComponent, FocusOnInitDirective],
  template: `
    <app-anchored-menu [placement]="placement" [width]="200">
      <input class="field" appFocusOnInit />
    </app-anchored-menu>
  `,
})
class AnchoredMenuWithFieldHostComponent {
  public readonly placement = { top: 10, bottom: null, right: 10 };
}

const pressOnFocused = (key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });

  document.activeElement?.dispatchEvent(event);

  return event;
};

describe('AnchoredMenuComponent opened from a trigger', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  const openFromItsTrigger = async () => {
    const fixture = TestBed.createComponent(AnchoredMenuHostComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    elementOf(fixture, '.opener')?.focus();
    fixture.componentInstance.isOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    return fixture;
  };

  it('takes the focus when it opens and hands it back to its trigger when it closes', async () => {
    const fixture = await openFromItsTrigger();

    expect(document.activeElement).toBe(elementOf(fixture, '.anchored-menu'));

    fixture.componentInstance.isOpen.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(elementOf(fixture, '.opener'));
  });

  it('closes on Escape and keeps the key from whatever layer it sits on', async () => {
    const fixture = await openFromItsTrigger();
    const heardBehind = vi.fn();
    document.addEventListener('keydown', heardBehind);

    pressOnFocused('Escape');
    fixture.detectChanges();

    expect(elementOf(fixture, '.anchored-menu')).toBeNull();
    expect(heardBehind).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heardBehind);
  });

  it('moves the focus through its buttons with the arrows, Home and End, and leaves those keys to a field being typed in', async () => {
    const fixture = await openFromItsTrigger();

    pressOnFocused('ArrowDown');

    expect(document.activeElement).toBe(elementOf(fixture, '.first'));

    pressOnFocused('End');

    expect(document.activeElement).toBe(elementOf(fixture, '.last'));

    pressOnFocused('ArrowDown');

    expect(document.activeElement).toBe(elementOf(fixture, '.first'));

    elementOf(fixture, '.field')?.focus();

    expect(pressOnFocused('Home').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(elementOf(fixture, '.field'));
  });

  it('asks to close when the window is resized, since it was placed for the window as it was', async () => {
    const fixture = await openFromItsTrigger();

    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(elementOf(fixture, '.anchored-menu')).toBeNull();
  });

  it('leaves the focus on the content that took it as the menu opened, such as a field to type in', async () => {
    const fixture = TestBed.createComponent(AnchoredMenuWithFieldHostComponent);
    document.body.appendChild(fixture.nativeElement);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.field'));
  });

  it('keeps taking the focus when it opens after a test overrides it, since it needs nothing that only an ahead-of-time build provides', async () => {
    TestBed.overrideComponent(AnchoredMenuComponent, { set: {} });
    const fixture = TestBed.createComponent(AnchoredMenuComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('placement', { top: 10, bottom: null, right: 10 });
    fixture.componentRef.setInput('width', 200);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(document.activeElement).toBe(elementOf(fixture, '.anchored-menu'));
  });
});
