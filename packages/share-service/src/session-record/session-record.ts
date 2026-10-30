export type SessionRecord = {
  readonly sessionId: string;
  readonly ownerTokenHash: string;
  readonly revision: number;
  readonly hasState: boolean;
  readonly expiresAtMilliseconds: number;
  readonly totalBytes: number;
  readonly chunkCount: number;
  readonly fileIds: readonly string[];
};

export type SessionTiming = {
  readonly revision: number;
  readonly expiresAtMilliseconds: number;
};

export type ChunkArrival = {
  readonly fileId: string;
  readonly previousBytes: number | null;
  readonly bytes: number;
};

export type SessionCapacity = {
  readonly maximumSessionBytes: number;
  readonly maximumSessionFiles: number;
  readonly maximumSessionChunks: number;
};

const NO_REVISION = 0;
const NO_BYTES = 0;
const NO_CHUNKS = 0;
const ONE_CHUNK_MORE = 1;
const NO_EXPIRY_LEFT = 0;

export const newSessionRecord = (sessionId: string, ownerTokenHash: string, expiresAtMilliseconds: number): SessionRecord => ({
  sessionId,
  ownerTokenHash,
  revision: NO_REVISION,
  hasState: false,
  expiresAtMilliseconds,
  totalBytes: NO_BYTES,
  chunkCount: NO_CHUNKS,
  fileIds: [],
});

export const renewedUntil = (record: SessionRecord, expiresAtMilliseconds: number): SessionRecord => ({ ...record, expiresAtMilliseconds });

export const renewalOf = (record: SessionRecord, expiresAtMilliseconds: number, renewalStepMilliseconds: number): SessionRecord | null =>
  expiresAtMilliseconds - record.expiresAtMilliseconds < renewalStepMilliseconds ? null : renewedUntil(record, expiresAtMilliseconds);

export const endedRecordOf = (record: SessionRecord): SessionRecord => renewedUntil(record, NO_EXPIRY_LEFT);

export const withChunk = (record: SessionRecord, arrival: ChunkArrival, capacity: SessionCapacity): SessionRecord | null => {
  const fileIds = record.fileIds.includes(arrival.fileId) ? record.fileIds : [...record.fileIds, arrival.fileId];
  const totalBytes = record.totalBytes - (arrival.previousBytes ?? NO_BYTES) + arrival.bytes;
  const chunkCount = arrival.previousBytes === null ? record.chunkCount + ONE_CHUNK_MORE : record.chunkCount;

  const isPastCapacity =
    fileIds.length > capacity.maximumSessionFiles || totalBytes > capacity.maximumSessionBytes || chunkCount > capacity.maximumSessionChunks;

  return isPastCapacity ? null : { ...record, fileIds, totalBytes, chunkCount };
};

export const withNextState = (record: SessionRecord): SessionRecord => ({ ...record, revision: record.revision + 1, hasState: true });

export const timingOf = (record: SessionRecord): SessionTiming => ({ revision: record.revision, expiresAtMilliseconds: record.expiresAtMilliseconds });
