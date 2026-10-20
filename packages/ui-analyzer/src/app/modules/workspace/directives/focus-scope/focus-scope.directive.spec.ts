import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FocusScopeDirective } from './focus-scope.directive';

@Component({
  imports: [FocusScopeDirective],
  template: `
    <button class="opener" type="button">open</button>
    <button class="elsewhere" type="button">elsewhere</button>
    @if (isOpen()) {
      <div class="layer" appFocusScope><button class="inside" type="button">inside</button></div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LayerHostComponent {
  public readonly isOpen = signal(false);
}

const renderHost = async () => {
  const fixture = TestBed.createComponent(LayerHostComponent);
  const host: HTMLElement = fixture.nativeElement;

  document.body.append(host);
  fixture.detectChanges();
  host.querySelector<HTMLElement>('.opener')?.focus();
  fixture.componentInstance.isOpen.set(true);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, host };
};

describe('FocusScopeDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('takes the focus when its layer opens, and hands it back to what had it when the layer closes', async () => {
    const { fixture, host } = await renderHost();

    expect(document.activeElement).toBe(host.querySelector('.layer'));

    host.querySelector<HTMLElement>('.inside')?.focus();
    fixture.componentInstance.isOpen.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('.opener'));
  });

  it('leaves the focus where the reader put it when they had already moved on before the layer closed', async () => {
    const { fixture, host } = await renderHost();

    host.querySelector<HTMLElement>('.elsewhere')?.focus();
    fixture.componentInstance.isOpen.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(host.querySelector('.elsewhere'));
  });
});
