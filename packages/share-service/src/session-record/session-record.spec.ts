import { describe, expect, it } from 'vitest';
import { newSessionRecord, renewedUntil, timingOf, withChunk, withNextState } from './session-record';

const CAPACITY = { maximumSessionBytes: 100, maximumSessionFiles: 2 };

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
      fileIds: [],
    });
  });

  it('withChunk, given a chunk of a new file within capacity, counts its bytes and its file', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const grown = withChunk(record, { fileId: 'a', previousBytes: 0, bytes: 40 }, CAPACITY);

    expect(grown).toMatchObject({ totalBytes: 40, fileIds: ['a'] });
  });

  it('withChunk, given a chunk replacing one of a known file, counts only the difference', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), totalBytes: 90, fileIds: ['a'] };

    const grown = withChunk(record, { fileId: 'a', previousBytes: 50, bytes: 60 }, CAPACITY);

    expect(grown).toMatchObject({ totalBytes: 100, fileIds: ['a'] });
  });

  it('withChunk, given a chunk past the bytes a session holds, refuses it', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), totalBytes: 90, fileIds: ['a'] };

    const grown = withChunk(record, { fileId: 'a', previousBytes: 0, bytes: 11 }, CAPACITY);

    expect(grown).toBeNull();
  });

  it('withChunk, given a chunk of one file more than a session holds, refuses it', () => {
    const record = { ...newSessionRecord('session', 'digest', 5000), fileIds: ['a', 'b'] };

    const grown = withChunk(record, { fileId: 'c', previousBytes: 0, bytes: 1 }, CAPACITY);

    expect(grown).toBeNull();
  });

  it('withNextState, renewedUntil and timingOf, applied in turn, advance the revision and move the expiry', () => {
    const record = newSessionRecord('session', 'digest', 5000);

    const published = renewedUntil(withNextState(record), 9000);

    expect(published.hasState).toBe(true);
    expect(timingOf(published)).toEqual({ revision: 1, expiresAtMilliseconds: 9000 });
  });
});
