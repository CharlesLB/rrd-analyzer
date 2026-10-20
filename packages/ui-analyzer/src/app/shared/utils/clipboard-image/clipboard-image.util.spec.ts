import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeClipboard, stubClipboard } from './clipboard-image.fixture';
import { canCopyImages, copyImage } from './clipboard-image.util';

describe('canCopyImages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    removeClipboard();
  });

  it('canCopyImages with an async clipboard that writes items says yes', () => {
    stubClipboard(vi.fn());

    expect(canCopyImages()).toBe(true);
  });

  it('canCopyImages with a clipboard that only writes text says no', () => {
    stubClipboard();

    expect(canCopyImages()).toBe(false);
  });
});

describe('copyImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    removeClipboard();
  });

  it('copyImage hands the clipboard the pending image under its type before the image is ready', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    stubClipboard(write);
    const pending = new Promise<Blob>(() => undefined);

    const copying = copyImage(pending, 'image/png');

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0][0].items).toEqual({ 'image/png': pending });
    await copying;
  });

  it('copyImage rejects when the clipboard refuses the write', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')));

    await expect(copyImage(Promise.resolve(new Blob(['png'])), 'image/png')).rejects.toThrow('blocked');
  });
});
