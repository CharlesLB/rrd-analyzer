import { describe, expect, it } from 'vitest';
import { boundedBodyOf } from './bounded-body';

const putOf = (body: BodyInit, headers: Record<string, string> = {}): Request => new Request('https://share.example/upload', { method: 'PUT', body, headers });

describe('boundedBodyOf', () => {
  it('given a body within the limit, answers its bytes', async () => {
    const request = putOf(new Uint8Array([1, 2, 3]));

    const content = await boundedBodyOf(request, 3);

    expect(new Uint8Array(content ?? new ArrayBuffer(0))).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('given a declared length past the limit, refuses it without reading', async () => {
    const request = putOf(new Uint8Array([1, 2, 3, 4]), { 'Content-Length': '4' });

    const content = await boundedBodyOf(request, 3);

    expect(content).toBeNull();
    expect(request.bodyUsed).toBe(false);
  });

  it('given a body with no declared length that turns out past the limit, refuses it', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
        controller.close();
      },
    });

    const content = await boundedBodyOf(putOf(stream), 3);

    expect(content).toBeNull();
  });

  it('given no body at all, answers no bytes', async () => {
    const request = new Request('https://share.example/upload', { method: 'PUT' });

    const content = await boundedBodyOf(request, 3);

    expect(content?.byteLength).toBe(0);
  });
});
