import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_COLORS } from '../../constants/colors';
import { stubCanvasEncoding, stubImageLoading } from './svg-raster.fixture';
import { rasterizeSvg } from './svg-raster.util';

const PICTURE = { markup: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="2"></svg>', width: 4, height: 2, background: THEME_COLORS.dark.bg };

describe('rasterizeSvg', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rasterizeSvg of a picture paints its background, then the svg over it at full size, and encodes a png', async () => {
    const loaded = stubImageLoading('load');
    const png = new Blob(['png'], { type: 'image/png' });
    const { canvas, context } = stubCanvasEncoding(png);

    const rasterized = await rasterizeSvg(PICTURE);

    expect(rasterized).toBe(png);
    expect(loaded.sources).toEqual([`data:image/svg+xml;charset=utf-8,${encodeURIComponent(PICTURE.markup)}`]);
    expect([canvas.width, canvas.height]).toEqual([4, 2]);
    expect(context.fillStyle).toBe(THEME_COLORS.dark.bg);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 4, 2);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4, 2);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('rasterizeSvg of markup the engine cannot load as an image rejects', async () => {
    stubImageLoading('error');
    stubCanvasEncoding(new Blob(['png']));

    await expect(rasterizeSvg(PICTURE)).rejects.toThrow('the svg could not be loaded as an image');
  });

  it('rasterizeSvg on a canvas that cannot encode rejects', async () => {
    stubImageLoading('load');
    stubCanvasEncoding(null);

    await expect(rasterizeSvg(PICTURE)).rejects.toThrow('the canvas could not be encoded as a png');
  });
});
