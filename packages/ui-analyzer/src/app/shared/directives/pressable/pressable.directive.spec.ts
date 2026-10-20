import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { PressableDirective } from './pressable.directive';

@Component({
  selector: 'app-pressable-host',
  imports: [PressableDirective],
  template: `<div class="card" appPressable (click)="pressed()"><span class="inner">inner</span></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PressableHostComponent {
  public readonly pressed = vi.fn();
}

const renderHost = () => {
  const fixture = TestBed.createComponent(PressableHostComponent);
  fixture.detectChanges();

  return fixture;
};

const press = (element: HTMLElement | null, key: string): void => {
  element?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

describe('PressableDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('gives what it is on the role and the focus a button has', () => {
    const fixture = renderHost();
    const card = elementOf(fixture, '.card');

    expect(card?.getAttribute('role')).toBe('button');
    expect(card?.getAttribute('tabindex')).toBe('0');
  });

  it('presses on Enter and on Space, and leaves any other key alone', () => {
    const fixture = renderHost();
    const card = elementOf(fixture, '.card');

    press(card, 'Enter');
    press(card, ' ');
    press(card, 'a');

    expect(fixture.componentInstance.pressed).toHaveBeenCalledTimes(2);
  });

  it('leaves a key pressed inside it to whatever holds the focus there', () => {
    const fixture = renderHost();

    press(elementOf(fixture, '.inner'), 'Enter');

    expect(fixture.componentInstance.pressed).not.toHaveBeenCalled();
  });
});
