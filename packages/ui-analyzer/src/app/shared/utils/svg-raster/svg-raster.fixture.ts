import { vi } from 'vitest';

const CANVAS_TAG = 'canvas';

export type ImageOutcome = 'load' | 'error';

export type StubbedCanvas = {
  readonly canvas: { width: number; height: number; readonly getContext: ReturnType<typeof vi.fn>; readonly toBlob: ReturnType<typeof vi.fn> };
  readonly context: { fillStyle: string; readonly fillRect: ReturnType<typeof vi.fn>; readonly drawImage: ReturnType<typeof vi.fn> };
};

export const stubImageLoading = (outcome: ImageOutcome): { readonly sources: string[] } => {
  const loaded = { sources: [] as string[] };

  class ImageThatSettles extends EventTarget {
    public set src(source: string) {
      loaded.sources.push(source);
      queueMicrotask(() => this.dispatchEvent(new Event(outcome)));
    }
  }

  vi.stubGlobal('Image', ImageThatSettles);

  return loaded;
};

export const stubCanvasEncoding = (encoded: Blob | null): StubbedCanvas => {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(encoded)),
  };

  const createElement = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === CANVAS_TAG ? (canvas as unknown as HTMLCanvasElement) : createElement(tag)));

  return { canvas, context };
};
