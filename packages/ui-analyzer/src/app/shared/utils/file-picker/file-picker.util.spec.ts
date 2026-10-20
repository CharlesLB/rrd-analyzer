import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL_GRACE_MILLISECONDS, pickFiles } from './file-picker.util';

const pickerOf = (): HTMLInputElement | null => document.body.querySelector<HTMLInputElement>('input[type="file"]');

const holding = (picker: HTMLInputElement | null, files: readonly File[]): void => {
  Object.defineProperty(picker, 'files', { value: files });
};

describe('pickFiles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pickFiles opens a hidden picker for the accepted extensions, for one file or many as asked', async () => {
    const picking = pickFiles(document, { accept: '.rrd,.xml', allowsMany: true });

    expect(pickerOf()?.accept).toBe('.rrd,.xml');
    expect(pickerOf()?.multiple).toBe(true);
    expect(pickerOf()?.style.display).toBe('none');

    pickerOf()?.dispatchEvent(new Event('cancel'));

    expect(await picking).toEqual([]);
  });

  it('pickFiles answers with the files picked and leaves no picker behind', async () => {
    const file = new File(['[]'], 'logs.json');
    const picking = pickFiles(document, { accept: '.json', allowsMany: false });
    const picker = pickerOf();
    holding(picker, [file]);

    picker?.dispatchEvent(new Event('change'));

    expect(await picking).toEqual([file]);
    expect(pickerOf()).toBeNull();
  });

  it('pickFiles on a webview that never says the dialog was cancelled answers with nothing once the window is back and nothing was picked', async () => {
    const picking = pickFiles(document, { accept: '.json', allowsMany: false });

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(CANCEL_GRACE_MILLISECONDS);

    expect(await picking).toEqual([]);
    expect(pickerOf()).toBeNull();
  });

  it('pickFiles still answers with a file whose pick is told just after the window is back', async () => {
    const file = new File(['[]'], 'logs.json');
    const picking = pickFiles(document, { accept: '.json', allowsMany: false });
    const picker = pickerOf();
    holding(picker, [file]);

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(CANCEL_GRACE_MILLISECONDS - 1);
    picker?.dispatchEvent(new Event('change'));
    vi.advanceTimersByTime(CANCEL_GRACE_MILLISECONDS);

    expect(await picking).toEqual([file]);
  });
});
