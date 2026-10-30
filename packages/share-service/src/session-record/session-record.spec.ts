import { describe, expect, it } from 'vitest';
import { endedRecordOf, newSessionRecord, renewalOf, renewedUntil, timingOf, withChunk, withNextState } from './session-record';

const CAPACITY = { maximumSessionBytes: 100, maximumSessionFiles: 2, maximumSessionChunks: 3 };

describe('session record', () => {
  it('newSessionRecord, given an identifier, a token digest and an expiry, starts at revision 0 with nothing stored', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    expect(record).toEqual({
      sessionId: 'session',
      ownerTokenHash: 'digest',
      revision: 0,
      hasState: false,
      expiresAtMilliseconds: 5000,
      totalBytes: 0,
      chunkCount: 0,
      fileIds: [],
    });
  });

  it('withChunk, given a chunk of a new file within capacity, counts its bytes, its file and the chunk', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const grown = withChunk(record, { fileId: 'a', previousBytes: null, bytes: 40 }, CAPACITY);

    expect(grown).toMatchObject({ totalBytes: 40, chunkCount: 1, fileIds: ['a'] });
  });

  it('withChunk, given a chunk replacing one of a known file, counts only the difference and no new chunk', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), totalBytes: 90, chunkCount: 2, fileIds: ['a'] };

    const grown = withChunk(record, { fileId: 'a', previousBytes: 50, bytes: 60 }, CAPACITY);

    expect(grown).toMatchObject({ totalBytes: 100, chunkCount: 2, fileIds: ['a'] });
  });

  it('withChunk, given a chunk past the bytes a session holds, refuses it', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), totalBytes: 90, chunkCount: 1, fileIds: ['a'] };

    const grown = withChunk(record, { fileId: 'a', previousBytes: null, bytes: 11 }, CAPACITY);

    expect(grown).toBeNull();
  });

  it('withChunk, given a chunk of one file more than a session holds, refuses it', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), chunkCount: 2, fileIds: ['a', 'b'] };

    const grown = withChunk(record, { fileId: 'c', previousBytes: null, bytes: 1 }, CAPACITY);

    expect(grown).toBeNull();
  });

  it('withChunk, given one chunk more than a session holds, even an empty one, refuses it', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), totalBytes: 3, chunkCount: 3, fileIds: ['a'] };

    const grown = withChunk(record, { fileId: 'a', previousBytes: null, bytes: 0 }, CAPACITY);

    expect(grown).toBeNull();
  });

  it('renewalOf, given an expiry less than a step past the one kept, leaves the record as it is', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const renewed = renewalOf(record, 5999, 1000);

    expect(renewed).toBeNull();
  });

  it('renewalOf, given an expiry a step or more past the one kept, moves it there', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const renewed = renewalOf(record, 6000, 1000);

    expect(renewed?.expiresAtMilliseconds).toBe(6000);
  });

  it('endedRecordOf, given a live record, leaves it expired and otherwise the same', () => {
    const record = withNextState(newSessionRecord('session', 'digest', 5000));

    const ended = endedRecordOf(record);

    expect(ended).toEqual({ ...record, expiresAtMilliseconds: 0 });
  });

  it('withNextState, renewedUntil and timingOf, applied in turn, advance the revision and move the expiry', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const published = renewedUntil(withNextState(record), 9000);

    expect(published.hasState).toBe(true);
    expect(timingOf(published)).toEqual({ revision: 1, expiresAtMilliseconds: 9000 });
  });
});
