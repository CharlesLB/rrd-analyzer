import { afterEach, describe, expect, it, vi } from 'vitest';
import { embeddedFontFaceOf } from './embedded-font.util';

const NUNITO = { family: 'Nunito', url: '/fonts/nunito-latin.woff2' };

const answering = (status: number, body: Blob = new Blob()) => vi.fn().mockResolvedValue({ ok: status < 400, status, blob: async () => body });

describe('embeddedFontFaceOf', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('embeddedFontFaceOf a bundled font inlines its bytes into a font face covering every weight', async () => {
    const fetchFont = answering(200, new Blob([new Uint8Array([0x77, 0x4f, 0x46, 0x32])], { type: 'font/woff2' }));
    vi.stubGlobal('fetch', fetchFont);

    const fontFace = await embeddedFontFaceOf(NUNITO);

    expect(fetchFont).toHaveBeenCalledWith('/fonts/nunito-latin.woff2');
    expect(fontFace).toBe("@font-face{font-family:'Nunito';font-weight:200 1000;src:url(data:font/woff2;base64,d09GMg==) format('woff2')}");
  });

  it('embeddedFontFaceOf a font the server does not have rejects with the status it answered', async () => {
    vi.stubGlobal('fetch', answering(404));

    await expect(embeddedFontFaceOf(NUNITO)).rejects.toThrow('the font at /fonts/nunito-latin.woff2 answered 404');
  });
});
