import { describe, expect, it } from 'vitest';
import { WebAssemblyRuntime } from './web-assembly-runtime';
import { FakeRuntimeWorker, settled } from './web-assembly-runtime.fixture';

const runtimeOver = (worker: FakeRuntimeWorker): WebAssemblyRuntime => new WebAssemblyRuntime(() => worker);

describe('WebAssemblyRuntime', () => {
  it('starts no worker until it is first asked for something, so building the gateway costs nothing', () => {
    const started: FakeRuntimeWorker[] = [];

    new WebAssemblyRuntime(() => {
      const worker = new FakeRuntimeWorker();
      started.push(worker);

      return worker;
    });

    expect(started).toEqual([]);
  });

  it('sends a call as the route, the method and the body in JSON, and answers with what the analyzer answered', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const responding = runtime.send({ method: 'POST', path: '/api/analyses', body: { name: 'capacity' } });
    worker.answer({ kind: 'answered', requestId: worker.lastRequestId(), status: 200, body: '{"id":"a1"}' });
    const response = await responding;

    expect(worker.posted[0]?.message).toEqual({ kind: 'serve', requestId: '1', method: 'POST', path: '/api/analyses', body: '{"name":"capacity"}' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'a1' });
  });

  it('answers a call with no body and an answer with no content, as a delete gets', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const responding = runtime.send({ method: 'DELETE', path: '/api/analyses/a1' });
    worker.answer({ kind: 'answered', requestId: worker.lastRequestId(), status: 204, body: '' });
    const response = await responding;

    expect(worker.posted[0]?.message['body']).toBeNull();
    expect(response.status).toBe(204);
  });

  it('pairs every answer with its own call, whatever order they come back in', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const first = runtime.send({ method: 'GET', path: '/api/analyses' });
    const second = runtime.send({ method: 'GET', path: '/api/build' });
    worker.answer({ kind: 'answered', requestId: '2', status: 200, body: '"build"' });
    worker.answer({ kind: 'answered', requestId: '1', status: 200, body: '"analyses"' });

    expect(await (await first).json()).toBe('analyses');
    expect(await (await second).json()).toBe('build');
  });

  it('hands a file over to be kept without copying it, and answers with the path it is kept under', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const keeping = runtime.keep(new File(['RRD'], 'cpu.rrd'));
    await settled();
    worker.answer({ kind: 'kept', requestId: worker.lastRequestId(), path: 'memory:/1/cpu.rrd' });

    expect(await keeping).toBe('memory:/1/cpu.rrd');
    expect(worker.posted[0]?.message['name']).toBe('cpu.rrd');
    expect(worker.posted[0]?.transfer).toHaveLength(1);
  });

  it('stops a call the page gives up on, and tells the analyzer to stop running it', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);
    const cancellation = new AbortController();

    const running = runtime.send({ method: 'POST', path: '/api/analyses/a1/insights', body: { scope: 'all' }, cancellation: cancellation.signal });
    cancellation.abort();

    await expect(running).rejects.toThrow('AbortError');
    expect(worker.posted.at(-1)?.message).toEqual({ kind: 'cancel', requestId: '1' });
  });

  it('fails a call the analyzer reports it could not run', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const responding = runtime.send({ method: 'GET', path: '/api/analyses' });
    worker.answer({ kind: 'failed', requestId: worker.lastRequestId(), reason: 'the analyzer did not start' });

    await expect(responding).rejects.toThrow('the analyzer did not start');
  });

  it('fails every call, now and later, once the worker itself could not load', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const waiting = runtime.send({ method: 'GET', path: '/api/analyses' });
    worker.crash();

    await expect(waiting).rejects.toThrow('could not be loaded');
    await expect(runtime.send({ method: 'GET', path: '/api/build' })).rejects.toThrow('could not be loaded');
  });

  it('fails a call the analyzer answers with a kept file instead of a response, rather than reading it as one', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const responding = runtime.send({ method: 'GET', path: '/api/analyses' });
    worker.answer({ kind: 'kept', requestId: worker.lastRequestId(), path: 'memory:/1/cpu.rrd' });

    await expect(responding).rejects.toThrow('the analyzer answered a request with the wrong kind of message');
  });

  it('fails a file to keep that the analyzer answers with a response instead of the path it is kept under', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);

    const keeping = runtime.keep(new File(['RRD'], 'cpu.rrd'));
    await settled();
    worker.answer({ kind: 'answered', requestId: worker.lastRequestId(), status: 200, body: '{}' });

    await expect(keeping).rejects.toThrow('the analyzer answered a request with the wrong kind of message');
  });

  it('refuses a call the page already gave up on without starting the analyzer or sending it anything', async () => {
    const started: FakeRuntimeWorker[] = [];

    const runtime = new WebAssemblyRuntime(() => {
      const worker = new FakeRuntimeWorker();
      started.push(worker);

      return worker;
    });

    const cancellation = new AbortController();
    cancellation.abort();

    const running = runtime.send({ method: 'POST', path: '/api/analyses/a1/insights', cancellation: cancellation.signal });

    await expect(running).rejects.toThrow('AbortError');
    expect(started).toEqual([]);
  });

  it('ignores a late answer to a call the page gave up on, and still pairs the next answers with their calls', async () => {
    const worker = new FakeRuntimeWorker();
    const runtime = runtimeOver(worker);
    const cancellation = new AbortController();

    const abandoned = runtime.send({ method: 'POST', path: '/api/analyses/a1/insights', cancellation: cancellation.signal });
    const listing = runtime.send({ method: 'GET', path: '/api/analyses' });
    cancellation.abort();
    worker.answer({ kind: 'answered', requestId: '1', status: 200, body: '"late"' });
    worker.answer({ kind: 'answered', requestId: '2', status: 200, body: '"analyses"' });

    await expect(abandoned).rejects.toThrow('AbortError');
    expect(await (await listing).json()).toBe('analyses');
  });
});
