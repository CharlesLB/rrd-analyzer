import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard-text.util';

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('copyText, when the clipboard takes the text, reports the copy as done', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('{"n": 1}', document)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('{"n": 1}');
  });

  it('copyText, when the clipboard is blocked, falls back to copying a selection and leaves nothing behind', async () => {
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });

    await expect(copyText('{"n": 1}', document)).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('copyText, when neither way works, reports the copy as failed', async () => {
    vi.stubGlobal('navigator', {});
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true });

    await expect(copyText('{"n": 1}', document)).resolves.toBe(false);
  });
});
