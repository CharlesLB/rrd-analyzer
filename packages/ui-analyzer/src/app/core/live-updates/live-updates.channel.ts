import { Service } from '@angular/core';

export const LIVE_UPDATE_KINDS = {
  REVISION: 'revision',
  RENEWED: 'renewed',
  EXPIRED: 'expired',
  DISCONNECTED: 'disconnected',
} as const;

export type LiveUpdate =
  | { readonly kind: typeof LIVE_UPDATE_KINDS.REVISION; readonly revision: number; readonly expiresAtMilliseconds: number }
  | { readonly kind: typeof LIVE_UPDATE_KINDS.RENEWED; readonly expiresAtMilliseconds: number }
  | { readonly kind: typeof LIVE_UPDATE_KINDS.EXPIRED }
  | { readonly kind: typeof LIVE_UPDATE_KINDS.DISCONNECTED };

type LiveUpdateListener = (update: LiveUpdate) => void;

const SOCKET_EVENTS = {
  MESSAGE: 'message',
  CLOSE: 'close',
} as const;

const EXPIRED_UPDATE: LiveUpdate = { kind: LIVE_UPDATE_KINDS.EXPIRED };
const DISCONNECTED_UPDATE: LiveUpdate = { kind: LIVE_UPDATE_KINDS.DISCONNECTED };

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isWholeNumber = (value: unknown): value is number => Number.isSafeInteger(value);

export const liveUpdateOf = (message: unknown): LiveUpdate | null => {
  const read = typeof message === 'string' ? readJson(message) : null;

  if (!isRecord(read)) {
    return null;
  }

  const { kind, revision, expiresAtMilliseconds } = read;

  if (kind === LIVE_UPDATE_KINDS.EXPIRED) {
    return EXPIRED_UPDATE;
  }

  if (!isWholeNumber(expiresAtMilliseconds)) {
    return null;
  }

  if (kind === LIVE_UPDATE_KINDS.RENEWED) {
    return { kind, expiresAtMilliseconds };
  }

  return kind === LIVE_UPDATE_KINDS.REVISION && isWholeNumber(revision) ? { kind, revision, expiresAtMilliseconds } : null;
};

@Service()
export class LiveUpdatesChannel {
  public watch(url: string, listener: LiveUpdateListener): () => void {
    const socket = new WebSocket(url);
    const watch = { isStopped: false };

    socket.addEventListener(SOCKET_EVENTS.MESSAGE, (event: MessageEvent) => {
      const update = liveUpdateOf(event.data);

      if (update !== null) {
        listener(update);
      }
    });

    socket.addEventListener(SOCKET_EVENTS.CLOSE, () => {
      if (!watch.isStopped) {
        listener(DISCONNECTED_UPDATE);
      }
    });

    return () => {
      watch.isStopped = true;
      socket.close();
    };
  }
}
