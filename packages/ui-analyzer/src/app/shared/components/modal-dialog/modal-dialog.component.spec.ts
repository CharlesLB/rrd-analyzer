import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { elementOf, renderWithInputs, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { MODAL_DIALOG_ROLES, ModalDialogComponent, type ModalDialogRole } from './modal-dialog.component';

@Component({
  selector: 'app-modal-dialog-host',
  imports: [ModalDialogComponent],
  template: `
    <app-modal-dialog heading="Share this analysis live?" helper="Anyone with the link can open it." closeLabel="close" [dialogRole]="role()" (closed)="closings.update((count) => count + 1)">
      <span class="lead" modalDialogLead></span>
      <p class="body">body</p>
      <button class="confirm" type="button" modalDialogFooter>Confirm</button>
    </app-modal-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ModalDialogHostComponent {
  public readonly role = signal<ModalDialogRole>(MODAL_DIALOG_ROLES.DIALOG);
  public readonly closings = signal(0);
}

const renderHost = () => {
  const fixture = TestBed.createComponent(ModalDialogHostComponent);
  fixture.detectChanges();

  return fixture;
};

describe('ModalDialogComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('heads the dialog with its title and helper, and names the dialog after the title for a screen reader', () => {
    const fixture = renderHost();
    const dialog = elementOf(fixture, '.modal-dialog');

    expect(textOf(fixture, '.modal-dialog-title')).toBe('Share this analysis live?');
    expect(textOf(fixture, '.modal-dialog-helper')).toBe('Anyone with the link can open it.');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(elementOf(fixture, '.modal-dialog-title')?.id);
    expect(elementOf(fixture, '.modal-dialog-close')?.getAttribute('aria-label')).toBe('close');
    expect(elementOf(fixture, '.modal-dialog-close')?.title).toBe('close');
  });

  it('as an alert, says so to a screen reader', () => {
    const fixture = renderHost();

    fixture.componentInstance.role.set(MODAL_DIALOG_ROLES.ALERT);
    fixture.detectChanges();

    expect(elementOf(fixture, '.modal-dialog')?.getAttribute('role')).toBe('alertdialog');
  });

  it('puts the lead in the header, the body under it and the actions in the footer', () => {
    const fixture = renderHost();

    expect(elementOf(fixture, '.modal-dialog-header .lead')).not.toBeNull();
    expect(elementOf(fixture, '.modal-dialog > .body')).not.toBeNull();
    expect(elementOf(fixture, '.modal-dialog-footer .confirm')).not.toBeNull();
  });

  it('gives every dialog its own title id', () => {
    const first = renderWithInputs(ModalDialogComponent, { heading: 'first', helper: '', closeLabel: 'close' });
    const second = renderWithInputs(ModalDialogComponent, { heading: 'second', helper: '', closeLabel: 'close' });

    expect(elementOf(first, '.modal-dialog-title')?.id).not.toBe(elementOf(second, '.modal-dialog-title')?.id);
  });

  it.each([
    { name: 'the close button', close: (fixture: ReturnType<typeof renderHost>) => elementOf(fixture, '.modal-dialog-close')?.click() },
    { name: 'Escape', close: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) },
    {
      name: 'a click that starts and ends on the scrim',
      close: (fixture: ReturnType<typeof renderHost>) => {
        const scrim = elementOf(fixture, '.modal-dialog-scrim');

        scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        scrim?.click();
      },
    },
  ])('asks to close on $name', ({ close }) => {
    const fixture = renderHost();

    close(fixture);

    expect(fixture.componentInstance.closings()).toBe(1);
  });

  it('stays open on a click inside the dialog', () => {
    const fixture = renderHost();

    elementOf(fixture, '.modal-dialog')?.click();
    elementOf(fixture, '.confirm')?.click();

    expect(fixture.componentInstance.closings()).toBe(0);
  });
});
