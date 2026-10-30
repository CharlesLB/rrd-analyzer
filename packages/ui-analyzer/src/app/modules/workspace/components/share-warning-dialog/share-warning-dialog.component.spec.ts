import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elementOf, renderWithInputs, textOf, textsOf } from '../../../../shared/utils/component-fixture/component-fixture.fixture';
import { ShareWarningDialogComponent } from './share-warning-dialog.component';

const renderDialog = (inputs: Readonly<Record<string, unknown>> = {}) =>
  renderWithInputs(ShareWarningDialogComponent, { fileCount: 3, hasLog: false, isBusy: false, ...inputs });

const pressEscape = (): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
};

describe('ShareWarningDialogComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('warns what is uploaded, that changes follow, when it is erased and that the key is in the link', () => {
    const fixture = renderDialog();

    expect(textOf(fixture, '.modal-dialog-title')).toBe('Share this analysis live?');
    expect(textsOf(fixture, '.share-warning-dialog-point')).toEqual([
      'Its 3 files and every chart are encrypted on this device and uploaded to the sharing server.',
      'While the session lives, every change you make is sent too: charts, colors, new files and the log.',
      'Everything is erased from the server 1 hour after the last activity, or as soon as you end the session. Closing the app does not end it.',
      'The key is part of the link and never reaches the server. Send it only to people who may see this data.',
    ]);
  });

  it('for an analysis with a log open, says the log is uploaded too', () => {
    expect(textsOf(renderDialog({ fileCount: 1, hasLog: true }), '.share-warning-dialog-point')[0]).toBe(
      'Its file, its log and every chart are encrypted on this device and uploaded to the sharing server.',
    );
  });

  it('puts the focus on Cancel, so a stray Enter never uploads anything', async () => {
    const fixture = renderDialog();

    await fixture.whenStable();

    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
  });

  it('asks for the link only when Create link is clicked', () => {
    const fixture = renderDialog();
    const confirmed = vi.fn();
    fixture.componentInstance.confirmed.subscribe(confirmed);

    elementOf(fixture, '.share-warning-dialog-confirm')?.click();

    expect(confirmed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'Cancel', close: (fixture: ReturnType<typeof renderDialog>) => elementOf(fixture, '.share-warning-dialog-cancel')?.click() },
    { name: 'the close button', close: (fixture: ReturnType<typeof renderDialog>) => elementOf(fixture, '.modal-dialog-close')?.click() },
    { name: 'Escape', close: () => pressEscape() },
  ])('closes without sharing when $name is used', ({ close }) => {
    const fixture = renderDialog();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    close(fixture);

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('while uploading, says so, and neither closes nor asks again', () => {
    const fixture = renderDialog({ isBusy: true });
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    pressEscape();

    expect(textOf(fixture, '.share-warning-dialog-confirm')).toBe('Uploading…');
    expect(elementOf(fixture, '.share-warning-dialog-confirm')?.hasAttribute('disabled')).toBe(true);
    expect(elementOf(fixture, '.share-warning-dialog-cancel')?.hasAttribute('disabled')).toBe(true);
    expect(closed).not.toHaveBeenCalled();
  });

  it('closes on a click that both starts and ends on the scrim', () => {
    const fixture = renderDialog();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const scrim = elementOf(fixture, '.modal-dialog-scrim');

    scrim?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    scrim?.click();

    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('ShareWarningDialogComponent, compiled again from its own metadata as a TestBed override compiles it, still finds the element it focuses', async () => {
    TestBed.overrideComponent(ShareWarningDialogComponent, { set: {} });
    await TestBed.compileComponents();
    const fixture = renderDialog();

    await fixture.whenStable();

    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
  });
});
