export type SessionRecord = {
  readonly sessionId: string;
  readonly ownerTokenHash: string;
  readonly revision: number;
  readonly hasState: boolean;
  readonly expiresAtMilliseconds: number;
  readonly totalBytes: number;
  readonly fileIds: readonly string[];
};

export type SessionTiming = {
  readonly revision: number;
  readonly expiresAtMilliseconds: number;
};

export type ChunkArrival = {
  readonly fileId: string;
  readonly previousBytes: number;
  readonly bytes: number;
};

export type SessionCapacity = {
  readonly maximumSessionBytes: number;
  readonly maximumSessionFiles: number;
};

const NO_REVISION = 0;
const NO_BYTES = 0;

export const newSessionRecord = (sessionId: string, ownerTokenHash: string, expiresAtMilliseconds: number): SessionRecord => ({
  sessionId,
  ownerTokenHash,
  revision: NO_REVISION,
  hasState: false,
  expiresAtMilliseconds,
  totalBytes: NO_BYTES,
  fileIds: [],
});

export const renewedUntil = (record: SessionRecord, expiresAtMilliseconds: number): SessionRecord => ({ ...record, expiresAtMilliseconds });

export const withChunk = (record: SessionRecord, arrival: ChunkArrival, capacity: SessionCapacity): SessionRecord | null => {
  const fileIds = record.fileIds.includes(arrival.fileId) ? record.fileIds : [...record.fileIds, arrival.fileId];
  const totalBytes = record.totalBytes - arrival.previousBytes + arrival.bytes;

  return fileIds.length > capacity.maximumSessionFiles || totalBytes > capacity.maximumSessionBytes ? null : { ...record, fileIds, totalBytes };
};

export const withNextState = (record: SessionRecord): SessionRecord => ({ ...record, revision: record.revision + 1, hasState: true });

export const timingOf = (record: SessionRecord): SessionTiming => ({ revision: record.revision, expiresAtMilliseconds: record.expiresAtMilliseconds });
