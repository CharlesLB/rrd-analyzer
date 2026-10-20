import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserGateway } from './browser.gateway';

const sourceInput = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');

  if (input === null) {
    throw new Error('the gateway did not open a file input');
  }

  return input;
};

const holding = (input: HTMLInputElement, files: readonly { name: string; size: number }[]): void => {
  Object.defineProperty(input, 'files', { value: { ...files, length: files.length } });
};

describe('BrowserGateway pickSources', () => {
  it('answers with the files the dialog picked and takes its input away again', async () => {
    const gateway = new BrowserGateway();

    const picking = gateway.pickSources();
    const input = sourceInput();
    holding(input, [{ name: 'cpu.rrd', size: 2048 }]);
    input.dispatchEvent(new Event('change'));

    expect(await picking).toEqual([{ name: 'cpu.rrd', path: '', size: 2048 }]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('answers with nothing when the dialog is cancelled, instead of waiting for a choice that never comes', async () => {
    const gateway = new BrowserGateway();

    const picking = gateway.pickSources();
    sourceInput().dispatchEvent(new Event('cancel'));

    expect(await picking).toEqual([]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('BrowserGateway describeFiles', () => {
  it('describes dropped files by name and size alone, since the development server cannot be handed their content', async () => {
    const described = await new BrowserGateway().describeFiles([new File(['RRD'], 'cpu.rrd')]);

    expect(described).toEqual([{ name: 'cpu.rrd', path: '', size: 3 }]);
  });
});

describe('BrowserGateway deleteAnalysis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for the delete in a way that outlives the page, since it may be sent as the page is left', async () => {
    const fetched = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetched);

    await new BrowserGateway().deleteAnalysis('a1');

    expect(fetched).toHaveBeenCalledWith(expect.stringMatching(/\/api\/analyses\/a1$/), expect.objectContaining({ method: 'DELETE', keepalive: true }));
  });
});
