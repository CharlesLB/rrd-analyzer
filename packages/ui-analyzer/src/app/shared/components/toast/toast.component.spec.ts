import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { elementOf, textOf } from '../../utils/component-fixture/component-fixture.fixture';
import { ToastComponent } from './toast.component';

@Component({
  imports: [ToastComponent],
  template:
    '<app-toast [message]="message()" [actionLabel]="actionLabel()" (actionChosen)="chosen()" (dismissed)="dismissed()" (held)="held()" (released)="released()" />',
})
class ToastHostComponent {
  public readonly message = signal<string | null>(null);
  public readonly actionLabel = signal<string | null>(null);
  public readonly chosen = vi.fn();
  public readonly dismissed = vi.fn();
  public readonly held = vi.fn();
  public readonly released = vi.fn();
}

const pointerDownOn = (target: EventTarget | null | undefined): void => {
  target?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
};

const renderToast = () => TestBed.createComponent(ToastHostComponent);

describe('ToastComponent', () => {
  it('shows nothing while there is no message', () => {
    const fixture = renderToast();
    fixture.detectChanges();

    expect(elementOf(fixture, '.toast')).toBeNull();
  });

  it('shows the message it is given', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('2 sources loaded');
    fixture.detectChanges();

    expect(textOf(fixture, '.toast-message')).toBe('2 sources loaded');
  });

  it('takes the toast off screen once the message is cleared', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('charts merged');
    fixture.detectChanges();
    fixture.componentInstance.message.set(null);
    fixture.detectChanges();

    expect(elementOf(fixture, '.toast')).toBeNull();
  });

  it('offers the action it is given as a button beside the message, and reports the press', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('atlas_system_memory_used merged into atlas_system_cpu_user');
    fixture.componentInstance.actionLabel.set('Undo');
    fixture.detectChanges();

    expect(textOf(fixture, '.toast-message')).toBe('atlas_system_memory_used merged into atlas_system_cpu_user');

    elementOf(fixture, '.toast-action')?.click();

    expect(textOf(fixture, '.toast-action')).toBe('Undo');
    expect(fixture.componentInstance.chosen).toHaveBeenCalledTimes(1);
  });

  it('announces its message from a status region that is there before any message comes', () => {
    const fixture = renderToast();
    fixture.detectChanges();
    const region = elementOf(fixture, '.toast-region');

    expect(region?.getAttribute('role')).toBe('status');
    expect(region?.getAttribute('aria-live')).toBe('polite');

    fixture.componentInstance.message.set('2 sources loaded');
    fixture.detectChanges();

    expect(region?.contains(elementOf(fixture, '.toast-message'))).toBe(true);
  });

  it('says it is held while the pointer or the focus is on it, and released once they leave', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('charts merged');
    fixture.detectChanges();
    const toast = elementOf(fixture, '.toast');

    toast?.dispatchEvent(new MouseEvent('mouseenter'));
    toast?.dispatchEvent(new MouseEvent('mouseleave'));
    toast?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    toast?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(fixture.componentInstance.held).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.released).toHaveBeenCalledTimes(2);
  });

  it('shows no button for a message without an action', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('2 sources loaded');
    fixture.detectChanges();

    expect(elementOf(fixture, '.toast-action')).toBeNull();
  });

  it('puts a close button before the message, named for what it does, that reports the dismissal', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('2 sources loaded');
    fixture.detectChanges();

    const closeButton = elementOf(fixture, '.toast > :first-child');
    closeButton?.click();

    expect(closeButton?.classList.contains('toast-close')).toBe(true);
    expect(closeButton?.getAttribute('aria-label')).toBe('dismiss');
    expect(fixture.componentInstance.dismissed).toHaveBeenCalled();
  });

  it('a press anywhere outside the action dismisses the toast', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('charts merged');
    fixture.componentInstance.actionLabel.set('Undo');
    fixture.detectChanges();

    pointerDownOn(document.body);

    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('a press on the message itself dismisses the toast too', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('charts merged');
    fixture.componentInstance.actionLabel.set('Undo');
    fixture.detectChanges();

    pointerDownOn(elementOf(fixture, '.toast-message'));

    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('a press on the action leaves the toast for the action to handle', () => {
    const fixture = renderToast();
    fixture.componentInstance.message.set('charts merged');
    fixture.componentInstance.actionLabel.set('Undo');
    fixture.detectChanges();

    pointerDownOn(elementOf(fixture, '.toast-action'));

    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();
  });

  it('a press while no toast is shown reports nothing', () => {
    const fixture = renderToast();
    fixture.detectChanges();

    pointerDownOn(document.body);

    expect(fixture.componentInstance.dismissed).not.toHaveBeenCalled();
  });
});
