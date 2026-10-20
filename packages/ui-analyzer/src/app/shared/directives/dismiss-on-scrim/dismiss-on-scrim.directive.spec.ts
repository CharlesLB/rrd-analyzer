import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf } from '../../utils/component-fixture/component-fixture.fixture';
import { DismissOnScrimDirective } from './dismiss-on-scrim.directive';

@Component({
  selector: 'app-dismiss-on-scrim-host',
  imports: [DismissOnScrimDirective],
  template: `<div class="scrim" appDismissOnScrim (dismissed)="dismissed()"><input class="field" /></div>`,
})
class DismissOnScrimHostComponent {
  public readonly dismissed = vi.fn();
}

describe('DismissOnScrimDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  const render = () => {
    const fixture = TestBed.createComponent(DismissOnScrimHostComponent);
    fixture.detectChanges();

    return fixture;
  };

  it('dismisses on a click that both starts and ends on the scrim itself', () => {
    const fixture = render();
    const scrim = elementOf(fixture, '.scrim');

    scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    scrim?.click();

    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('keeps what sits on the scrim when a press started inside it, such as a text selection, ends on the scrim', () => {
    const fixture = render();

    elementOf(fixture, '.field')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    elementOf(fixture, '.scrim')?.click();
    elementOf(fixture, '.field')?.click();

    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();
  });
});
