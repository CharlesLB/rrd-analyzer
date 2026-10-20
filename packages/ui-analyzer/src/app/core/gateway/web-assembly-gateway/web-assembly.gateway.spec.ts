import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAssemblyGateway } from './web-assembly.gateway';
import { FakeRuntimeWorker, settled } from './web-assembly-runtime/web-assembly-runtime.fixture';

describe('WebAssemblyGateway', () => {
  const started: { scripts: string[]; workers: FakeRuntimeWorker[] } = { scripts: [], workers: [] };

  beforeEach(() => {
    started.scripts = [];
    started.workers = [];
    vi.stubGlobal(
      'Worker',
      class extends FakeRuntimeWorker {
        public constructor(script: string) {
          super();
          started.scripts.push(script);
          started.workers.push(this);
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs the analyzer in the worker shipped beside the app, and reaches it through the same routes as the development server', async () => {
    const gateway = new WebAssemblyGateway();

    const listing = gateway.listAnalyses();
    const worker = started.workers[0];
    worker?.answer({ kind: 'answered', requestId: worker.lastRequestId(), status: 200, body: '[]' });

    expect(await listing).toEqual([]);
    expect(started.scripts).toEqual(['browser-runtime/analyzer.worker.js']);
    expect(worker?.posted[0]?.message).toEqual(expect.objectContaining({ kind: 'serve', method: 'GET', path: '/api/analyses' }));
  });

  it('keeps every dropped file in the analyzer and describes it by the path it is kept under', async () => {
    const gateway = new WebAssemblyGateway();

    const describing = gateway.describeFiles([new File(['RRD'], 'cpu.rrd')]);
    await settled();
    const worker = started.workers[0];
    worker?.answer({ kind: 'kept', requestId: worker.lastRequestId(), path: 'memory:/1/cpu.rrd' });

    expect(await describing).toEqual([{ name: 'cpu.rrd', path: 'memory:/1/cpu.rrd', size: 3 }]);
  });

  it('turns a refusal of the analyzer into an error naming the route', async () => {
    const gateway = new WebAssemblyGateway();

    const opening = gateway.openAnalysis('missing');
    const worker = started.workers[0];
    worker?.answer({ kind: 'answered', requestId: worker.lastRequestId(), status: 404, body: 'analysis not found' });

    await expect(opening).rejects.toThrow('GET /api/analyses/missing/bundle failed: 404 analysis not found');
  });
});
