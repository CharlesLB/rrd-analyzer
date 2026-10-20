import type { ApiCall } from '../../api-gateway/api.gateway';

export const RUNTIME_MESSAGE_KINDS = {
  SERVE: 'serve',
  CANCEL: 'cancel',
  KEEP: 'keep',
  ANSWERED: 'answered',
  KEPT: 'kept',
  FAILED: 'failed',
} as const;

export type RuntimeAnswer =
  | { readonly kind: typeof RUNTIME_MESSAGE_KINDS.ANSWERED; readonly requestId: string; readonly status: number; readonly body: string }
  | { readonly kind: typeof RUNTIME_MESSAGE_KINDS.KEPT; readonly requestId: string; readonly path: string }
  | { readonly kind: typeof RUNTIME_MESSAGE_KINDS.FAILED; readonly requestId: string; readonly reason: string };

type PendingRequest = {
  readonly settle: (answer: RuntimeAnswer) => void;
  readonly fail: (error: Error) => void;
};

export type RuntimeWorker = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
};

export type WorkerFactory = () => RuntimeWorker;

const MESSAGE_EVENT = 'message';
const ERROR_EVENT = 'error';
const ABORT_EVENT = 'abort';
const JSON_CONTENT_TYPE = 'application/json';
const ABORT_ERROR_NAME = 'AbortError';
const RUNTIME_DID_NOT_LOAD = 'the analyzer could not be loaded in this browser';
const UNEXPECTED_ANSWER = 'the analyzer answered a request with the wrong kind of message';
const STATUSES_WITHOUT_BODY: ReadonlySet<number> = new Set([204, 205, 304]);

const abortError = (): DOMException => new DOMException(ABORT_ERROR_NAME, ABORT_ERROR_NAME);

const responseOf = (answer: RuntimeAnswer): Response => {
  if (answer.kind !== RUNTIME_MESSAGE_KINDS.ANSWERED) {
    throw new Error(UNEXPECTED_ANSWER);
  }

  const body = STATUSES_WITHOUT_BODY.has(answer.status) ? null : answer.body;

  return new Response(body, { status: answer.status, headers: { 'Content-Type': JSON_CONTENT_TYPE } });
};

const keptPathOf = (answer: RuntimeAnswer): string => {
  if (answer.kind !== RUNTIME_MESSAGE_KINDS.KEPT) {
    throw new Error(UNEXPECTED_ANSWER);
  }

  return answer.path;
};

export class WebAssemblyRuntime {
  private readonly _startWorker: WorkerFactory;
  private readonly _pending = new Map<string, PendingRequest>();
  private readonly _sequence = { lastIssuedNumber: 0 };
  private readonly _state: { worker?: RuntimeWorker; failure?: Error } = {};

  public constructor(startWorker: WorkerFactory) {
    this._startWorker = startWorker;
  }

  public async send(call: ApiCall): Promise<Response> {
    const requestId = this._nextRequestId();
    const body = call.body === undefined ? null : JSON.stringify(call.body);

    const answer = await this._request(
      requestId,
      { kind: RUNTIME_MESSAGE_KINDS.SERVE, requestId, method: call.method, path: call.path, body },
      call.cancellation,
    );

    return responseOf(answer);
  }

  public async keep(file: File): Promise<string> {
    const requestId = this._nextRequestId();
    const content = await file.arrayBuffer();
    const answer = await this._request(requestId, { kind: RUNTIME_MESSAGE_KINDS.KEEP, requestId, name: file.name, content }, undefined, [content]);

    return keptPathOf(answer);
  }

  private async _request(requestId: string, message: object, cancellation?: AbortSignal, transfer: readonly Transferable[] = []): Promise<RuntimeAnswer> {
    if (this._state.failure !== undefined) {
      throw this._state.failure;
    }

    if (cancellation?.aborted) {
      throw abortError();
    }

    const worker = this._worker();

    return await new Promise<RuntimeAnswer>((resolve, reject) => {
      const giveUp = (): void => {
        this._pending.delete(requestId);
        worker.postMessage({ kind: RUNTIME_MESSAGE_KINDS.CANCEL, requestId });
        reject(abortError());
      };

      const stopListening = (): void => cancellation?.removeEventListener(ABORT_EVENT, giveUp);

      this._pending.set(requestId, {
        settle: (answer) => {
          stopListening();
          resolve(answer);
        },
        fail: (error) => {
          stopListening();
          reject(error);
        },
      });
      cancellation?.addEventListener(ABORT_EVENT, giveUp, { once: true });
      worker.postMessage(message, [...transfer]);
    });
  }

  private _worker(): RuntimeWorker {
    if (this._state.worker !== undefined) {
      return this._state.worker;
    }

    const worker = this._startWorker();

    worker.addEventListener(MESSAGE_EVENT, (event: MessageEvent<RuntimeAnswer>) => this._receive(event.data));
    worker.addEventListener(ERROR_EVENT, () => this._failEverything(new Error(RUNTIME_DID_NOT_LOAD)));
    this._state.worker = worker;

    return worker;
  }

  private _receive(answer: RuntimeAnswer): void {
    const pending = this._pending.get(answer.requestId);

    if (pending === undefined) {
      return;
    }

    this._pending.delete(answer.requestId);

    if (answer.kind === RUNTIME_MESSAGE_KINDS.FAILED) {
      pending.fail(new Error(answer.reason));

      return;
    }

    pending.settle(answer);
  }

  private _failEverything(failure: Error): void {
    this._state.failure = failure;
    this._pending.forEach((pending) => {
      pending.fail(failure);
    });
    this._pending.clear();
  }

  private _nextRequestId(): string {
    this._sequence.lastIssuedNumber += 1;

    return `${this._sequence.lastIssuedNumber}`;
  }
}
