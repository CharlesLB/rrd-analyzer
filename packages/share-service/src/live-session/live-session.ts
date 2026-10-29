import { DurableObject } from 'cloudflare:workers';
import { FAILURES, failureResponse } from '../api-response/api-response';
import { eraseBlobsUnder } from '../blob-erasure/blob-erasure';
import { chunkKeyOf, sessionPrefixOf, stateKeyOf } from '../blob-keys/blob-keys';
import type { ServiceEnvironment } from '../config/service-environment';
import { HTTP_STATUSES } from '../constants/http';
import { EXPIRED_MESSAGE, type LiveMessage, renewedMessageOf, revisionMessageOf } from '../live-message/live-message';
import { isSameOwnerTokenHash } from '../owner-token/owner-token';
import { type ServiceSettings, settingsOf } from '../service-settings/service-settings';
import { done, REFUSALS, refused, type SessionOutcome } from '../session-outcome/session-outcome';
import { newSessionRecord, renewedUntil, type SessionRecord, type SessionTiming, timingOf, withChunk, withNextState } from '../session-record/session-record';

export type ChunkUpload = {
  readonly ownerTokenHash: string;
  readonly fileId: string;
  readonly index: number;
  readonly content: ArrayBuffer;
};

export type StateUpload = {
  readonly ownerTokenHash: string;
  readonly content: ArrayBuffer;
};

export type PublishedState = {
  readonly content: ArrayBuffer;
  readonly timing: SessionTiming;
};

const RECORD_KEY = 'session';
const CHUNK_SIZE_KEY_PREFIX = 'chunk-size/';
const NO_PREVIOUS_BYTES = 0;
const ERASURE_PAGE_SIZE = 1000;
const NORMAL_CLOSURE = 1000;
const SESSION_ENDED_REASON = 'session ended';

export class LiveSession extends DurableObject<ServiceEnvironment> {
  private readonly _settings: ServiceSettings;

  public constructor(state: DurableObjectState, environment: ServiceEnvironment) {
    super(state, environment);
    this._settings = settingsOf(environment);
  }

  public async create(sessionId: string, ownerTokenHash: string): Promise<SessionTiming> {
    const record = newSessionRecord(sessionId, ownerTokenHash, this._nextExpiry());

    await this._keep(record);

    return timingOf(record);
  }

  public async storeChunk(upload: ChunkUpload): Promise<SessionOutcome<null>> {
    const owned = await this._ownedRecord(upload.ownerTokenHash);

    if (owned.refusal !== null) {
      return refused(owned.refusal);
    }

    const chunkSizeKey = `${CHUNK_SIZE_KEY_PREFIX}${upload.fileId}/${upload.index}`;
    const previousBytes = (await this.ctx.storage.get<number>(chunkSizeKey)) ?? NO_PREVIOUS_BYTES;
    const grown = withChunk(owned.value, { fileId: upload.fileId, previousBytes, bytes: upload.content.byteLength }, this._settings);

    if (grown === null) {
      return refused(REFUSALS.SESSION_TOO_LARGE);
    }

    await this.ctx.storage.put(chunkSizeKey, upload.content.byteLength);
    await this._keep(renewedUntil(grown, this._nextExpiry()));
    await this.env.SESSION_BLOBS.put(chunkKeyOf({ sessionId: grown.sessionId, fileId: upload.fileId, index: upload.index }), upload.content);

    return done(null);
  }

  public async storeState(upload: StateUpload): Promise<SessionOutcome<SessionTiming>> {
    const owned = await this._ownedRecord(upload.ownerTokenHash);

    if (owned.refusal !== null) {
      return refused(owned.refusal);
    }

    const published = renewedUntil(withNextState(owned.value), this._nextExpiry());

    await this._keep(published);
    await this.env.SESSION_BLOBS.put(stateKeyOf(published.sessionId), upload.content);
    this._broadcast(revisionMessageOf(timingOf(published)));

    return done(timingOf(published));
  }

  public async readState(): Promise<SessionOutcome<PublishedState>> {
    const record = await this._liveRecord();

    if (record === null) {
      return refused(REFUSALS.SESSION_NOT_FOUND);
    }

    if (!record.hasState) {
      return refused(REFUSALS.STATE_NOT_PUBLISHED);
    }

    const renewed = renewedUntil(record, this._nextExpiry());

    await this._keep(renewed);

    const sealedState = await this.env.SESSION_BLOBS.get(stateKeyOf(renewed.sessionId));

    if (sealedState === null) {
      return refused(REFUSALS.STATE_NOT_PUBLISHED);
    }

    this._broadcast(renewedMessageOf(timingOf(renewed)));

    return done({ content: await sealedState.arrayBuffer(), timing: timingOf(renewed) });
  }

  public async status(): Promise<SessionOutcome<SessionTiming>> {
    const record = await this._liveRecord();

    return record === null ? refused(REFUSALS.SESSION_NOT_FOUND) : done(timingOf(record));
  }

  public async end(ownerTokenHash: string): Promise<SessionOutcome<null>> {
    const owned = await this._ownedRecord(ownerTokenHash);

    if (owned.refusal !== null) {
      return refused(owned.refusal);
    }

    await this._erase(owned.value);

    return done(null);
  }

  public override async fetch(): Promise<Response> {
    if ((await this._liveRecord()) === null) {
      return failureResponse(FAILURES.SESSION_NOT_FOUND);
    }

    const [viewerSocket, sessionSocket] = Object.values(new WebSocketPair());

    this.ctx.acceptWebSocket(sessionSocket);

    return new Response(null, { status: HTTP_STATUSES.SWITCHING_PROTOCOLS, webSocket: viewerSocket });
  }

  public override async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<SessionRecord>(RECORD_KEY);

    if (record !== undefined) {
      await this._erase(record);
    }
  }

  private _nextExpiry(): number {
    return Date.now() + this._settings.inactivityMilliseconds;
  }

  private async _keep(record: SessionRecord): Promise<void> {
    await this.ctx.storage.put(RECORD_KEY, record);
    await this.ctx.storage.setAlarm(record.expiresAtMilliseconds);
  }

  private async _liveRecord(): Promise<SessionRecord | null> {
    const record = await this.ctx.storage.get<SessionRecord>(RECORD_KEY);

    if (record === undefined) {
      return null;
    }

    if (record.expiresAtMilliseconds <= Date.now()) {
      await this._erase(record);

      return null;
    }

    return record;
  }

  private async _ownedRecord(ownerTokenHash: string): Promise<SessionOutcome<SessionRecord>> {
    const record = await this._liveRecord();

    if (record === null) {
      return refused(REFUSALS.SESSION_NOT_FOUND);
    }

    return isSameOwnerTokenHash(record.ownerTokenHash, ownerTokenHash) ? done(record) : refused(REFUSALS.OWNER_TOKEN_REJECTED);
  }

  private _broadcast(message: LiveMessage): void {
    const text = JSON.stringify(message);

    this.ctx.getWebSockets().forEach((socket) => {
      socket.send(text);
    });
  }

  private async _erase(record: SessionRecord): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this._broadcast(EXPIRED_MESSAGE);
    this.ctx.getWebSockets().forEach((socket) => {
      socket.close(NORMAL_CLOSURE, SESSION_ENDED_REASON);
    });
    await eraseBlobsUnder(this.env.SESSION_BLOBS, sessionPrefixOf(record.sessionId), ERASURE_PAGE_SIZE);
  }
}
