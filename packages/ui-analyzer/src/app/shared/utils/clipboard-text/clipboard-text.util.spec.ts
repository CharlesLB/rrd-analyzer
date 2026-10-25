import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard-text.util';

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('copyText, when the clipboard takes the text, reports the copy as done', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('{"n": 1}')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('{"n": 1}');
  });

  it('copyText, when the clipboard refuses the text, reports the copy as failed', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });

    await expect(copyText('{"n": 1}')).resolves.toBe(false);
  });

  it('copyText, when the page has no clipboard at all, reports the copy as failed', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyText('{"n": 1}')).resolves.toBe(false);
  });
});
