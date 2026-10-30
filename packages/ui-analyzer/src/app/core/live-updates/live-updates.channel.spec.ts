import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_UPDATE_KINDS, type LiveUpdate, LiveUpdatesChannel, liveUpdateOf } from './live-updates.channel';

class FakeSocket extends EventTarget {
  public static readonly opened: FakeSocket[] = [];

  public readonly url: string;
  public isClosed = false;

  public constructor(url: string) {
    super();
    this.url = url;
    FakeSocket.opened.push(this);
  }

  public close(): void {
    this.isClosed = true;
    this.dispatchEvent(new Event('close'));
  }

  public receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }

  public drop(): void {
    this.dispatchEvent(new Event('close'));
  }
}

const LIVE_URL = 'wss://rrd-analyzer.example/api/sessions/s1/live';

const watching = (): { readonly socket: FakeSocket; readonly updates: LiveUpdate[]; readonly stop: () => void } => {
  vi.stubGlobal('WebSocket', FakeSocket);
  const updates: LiveUpdate[] = [];
  const stop = TestBed.inject(LiveUpdatesChannel).watch(LIVE_URL, (update) => updates.push(update));
  const socket = FakeSocket.opened.at(-1);

  if (socket === undefined) {
    throw new Error('the channel opened no socket');
  }

  return { socket, updates, stop };
};

describe('liveUpdateOf', () => {
  it.each([
    {
      name: 'a new revision',
      message: '{"kind":"revision","revision":4,"expiresAtMilliseconds":1000}',
      update: { kind: LIVE_UPDATE_KINDS.REVISION, revision: 4, expiresAtMilliseconds: 1000 },
    },
    { name: 'a renewal', message: '{"kind":"renewed","expiresAtMilliseconds":2000}', update: { kind: LIVE_UPDATE_KINDS.RENEWED, expiresAtMilliseconds: 2000 } },
    { name: 'the end of the session', message: '{"kind":"expired"}', update: { kind: LIVE_UPDATE_KINDS.EXPIRED } },
  ])('liveUpdateOf, for $name, reads it', ({ message, update }) => {
    expect(liveUpdateOf(message)).toEqual(update);
  });

  it.each([
    { name: 'bytes instead of text', message: new ArrayBuffer(2) },
    { name: 'text that is not json', message: 'revision 4' },
    { name: 'json that is not an object', message: '[1,2]' },
    { name: 'a kind it does not know', message: '{"kind":"paused","expiresAtMilliseconds":1000}' },
    { name: 'a revision with no expiry', message: '{"kind":"revision","revision":4}' },
    { name: 'a revision that is not a whole number', message: '{"kind":"revision","revision":4.5,"expiresAtMilliseconds":1000}' },
    { name: 'a renewal with an expiry written as text', message: '{"kind":"renewed","expiresAtMilliseconds":"soon"}' },
  ])('liveUpdateOf, for $name, reads nothing', ({ message }) => {
    expect(liveUpdateOf(message)).toBeNull();
  });
});

describe('LiveUpdatesChannel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('watch opens a socket on the live address and hands over each update it understands', () => {
    const { socket, updates } = watching();

    socket.receive('{"kind":"renewed","expiresAtMilliseconds":2000}');
    socket.receive('not an update');

    expect(socket.url).toBe(LIVE_URL);
    expect(updates).toEqual([{ kind: LIVE_UPDATE_KINDS.RENEWED, expiresAtMilliseconds: 2000 }]);
  });

  it('watch, when the socket drops on its own, says the channel was disconnected', () => {
    const { socket, updates } = watching();

    socket.drop();

    expect(updates).toEqual([{ kind: LIVE_UPDATE_KINDS.DISCONNECTED }]);
  });

  it('stopping the watch closes the socket without reporting a disconnection', () => {
    const { socket, updates, stop } = watching();

    stop();

    expect(socket.isClosed).toBe(true);
    expect(updates).toEqual([]);
  });
});
