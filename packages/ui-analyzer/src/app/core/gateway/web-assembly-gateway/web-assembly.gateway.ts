import { Service } from '@angular/core';
import type { PickedFileDto } from '../analyzer.dto';
import { ApiGateway } from '../api-gateway/api.gateway';
import { type RuntimeWorker, WebAssemblyRuntime } from './web-assembly-runtime/web-assembly-runtime';

const RUNTIME_WORKER_SCRIPT = 'browser-runtime/analyzer.worker.js';

const startRuntimeWorker = (): RuntimeWorker => new Worker(RUNTIME_WORKER_SCRIPT);

const keepingEachFile =
  (runtime: WebAssemblyRuntime) =>
  async (files: readonly File[]): Promise<readonly PickedFileDto[]> =>
    await Promise.all(files.map(async (file) => ({ name: file.name, path: await runtime.keep(file), size: file.size })));

@Service()
export class WebAssemblyGateway extends ApiGateway {
  public constructor() {
    const runtime = new WebAssemblyRuntime(startRuntimeWorker);

    super({ send: async (call) => await runtime.send(call), describeFiles: keepingEachFile(runtime) });
  }
}
