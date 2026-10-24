import { afterEach, describe, expect, it, vi } from 'vitest';
import { base64Of, blobOfBase64, dataUrlOf } from './blob-encoding.util';

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('dataUrlOf', () => {
  it('dataUrlOf a typed blob reads it back as a data url carrying its type', async () => {
    expect(await dataUrlOf(new Blob([PNG_SIGNATURE], { type: 'image/png' }))).toBe('data:image/png;base64,iVBORw0KGgo=');
  });
});

describe('base64Of', () => {
  it('base64Of a blob keeps only the encoded bytes, without the data url prefix', async () => {
    expect(await base64Of(new Blob([PNG_SIGNATURE], { type: 'image/png' }))).toBe('iVBORw0KGgo=');
  });
});

describe('blobOfBase64', () => {
  it('blobOfBase64 decodes the bytes back into a blob of the given type, the way base64Of encoded them', async () => {
    const blob = blobOfBase64('iVBORw0KGgo=', 'application/octet-stream');

    expect(blob.type).toBe('application/octet-stream');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG_SIGNATURE);
  });
});

type ReaderOutcome = {
  readonly event: string;
  readonly result: unknown;
  readonly error: DOMException | null;
};

const stubFileReader = (outcome: ReaderOutcome): void => {
  class SettlingFileReader extends EventTarget {
    public readonly result = outcome.result;
    public readonly error = outcome.error;

    public readAsDataURL(): void {
      queueMicrotask(() => this.dispatchEvent(new Event(outcome.event)));
    }
  }

  vi.stubGlobal('FileReader', SettlingFileReader);
};

describe('dataUrlOf when the reader does not give a data url', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dataUrlOf a blob the reader reads into something other than text rejects', async () => {
    stubFileReader({ event: 'load', result: new ArrayBuffer(0), error: null });

    await expect(dataUrlOf(new Blob(['png']))).rejects.toThrow('the blob was not read as a data url');
  });

  it('dataUrlOf a blob the reader fails to read rejects with the error the reader gives', async () => {
    const denied = new DOMException('the file cannot be read', 'NotReadableError');
    stubFileReader({ event: 'error', result: null, error: denied });

    await expect(dataUrlOf(new Blob(['png']))).rejects.toBe(denied);
  });

  it('dataUrlOf a blob the reader fails to read without saying why rejects with an error of its own', async () => {
    stubFileReader({ event: 'error', result: null, error: null });

    await expect(dataUrlOf(new Blob(['png']))).rejects.toThrow('the blob could not be read');
  });
});
