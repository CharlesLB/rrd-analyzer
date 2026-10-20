const SVG_DATA_URL_PREFIX = 'data:image/svg+xml;charset=utf-8,';
export const PNG_MIME_TYPE = 'image/png';
const CANVAS_TAG = 'canvas';
const TWO_DIMENSIONS = '2d';

export type SvgPicture = {
  readonly markup: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
};

const loadedImageOf = async (source: string): Promise<HTMLImageElement> =>
  await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('the svg could not be loaded as an image')));
    image.src = source;
  });

const pngOf = async (canvas: HTMLCanvasElement): Promise<Blob> =>
  await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((encoded) => {
      if (encoded === null) {
        reject(new Error('the canvas could not be encoded as a png'));

        return;
      }

      resolve(encoded);
    }, PNG_MIME_TYPE);
  });

export const rasterizeSvg = async (picture: SvgPicture): Promise<Blob> => {
  const image = await loadedImageOf(`${SVG_DATA_URL_PREFIX}${encodeURIComponent(picture.markup)}`);
  const canvas = document.createElement(CANVAS_TAG);
  const context = canvas.getContext(TWO_DIMENSIONS);

  if (context === null) {
    throw new Error('the canvas has no 2d context to draw the svg on');
  }

  canvas.width = picture.width;
  canvas.height = picture.height;
  context.fillStyle = picture.background;
  context.fillRect(0, 0, picture.width, picture.height);
  context.drawImage(image, 0, 0, picture.width, picture.height);

  return await pngOf(canvas);
};
