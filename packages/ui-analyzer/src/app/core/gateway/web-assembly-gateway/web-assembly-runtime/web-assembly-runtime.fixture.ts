import type { RuntimeAnswer, RuntimeWorker } from './web-assembly-runtime';

type Listener = (event: MessageEvent) => void;

export type PostedMessage = {
  readonly message: Record<string, unknown>;
  readonly transfer: readonly Transferable[];
};

const MESSAGE_EVENT = 'message';
const ERROR_EVENT = 'error';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export class FakeRuntimeWorker implements RuntimeWorker {
  public readonly posted: PostedMessage[] = [];

  private readonly _listeners = new Map<string, Listener[]>();

  public addEventListener(type: string, listener: Listener): void {
    this._listeners.set(type, [...(this._listeners.get(type) ?? []), listener]);
  }

  public postMessage(message: unknown, transfer: Transferable[] = []): void {
    this.posted.push({ message: isRecord(message) ? message : {}, transfer });
  }

  public answer(answer: RuntimeAnswer): void {
    this._emit(new MessageEvent(MESSAGE_EVENT, { data: answer }));
  }

  public crash(): void {
    this._emit(new MessageEvent(ERROR_EVENT));
  }

  public lastRequestId(): string {
    const requestId = this.posted.at(-1)?.message['requestId'];

    return typeof requestId === 'string' ? requestId : '';
  }

  private _emit(event: MessageEvent): void {
    (this._listeners.get(event.type) ?? []).forEach((listener) => {
      listener(event);
    });
  }
}

export const settled = async (): Promise<void> => await new Promise((resolve) => setTimeout(resolve, 0));
