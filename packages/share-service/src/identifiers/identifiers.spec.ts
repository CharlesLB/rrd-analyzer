import { describe, expect, it } from 'vitest';
import { base64UrlOf, chunkIndexOf, isIdentifier, MAXIMUM_CHUNK_INDEX, newOwnerToken, newSessionId } from './identifiers';

describe('identifiers', () => {
  it('base64UrlOf, given bytes that encode to plus, slash and padding, writes them URL-safe without padding', () => {
    const bytes = new Uint8Array([251, 255, 191]);

    const encoded = base64UrlOf(new Uint8Array([...bytes, 1]));

    expect(encoded).toBe('-_-_AQ');
  });

  it('newSessionId, called twice, answers two different 22-character identifiers', () => {
    const first = newSessionId();
    const second = newSessionId();

    expect(isIdentifier(first)).toBe(true);
    expect(isIdentifier(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('newOwnerToken, called, answers 43 base64url characters', () => {
    const token = newOwnerToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it.each([
    ['too short', 'abc'],
    ['a character outside base64url', 'AAAAAAAAAAAAAAAAAAAAA+'],
    ['too long', 'AAAAAAAAAAAAAAAAAAAAAAA'],
  ])('isIdentifier, given text %s, refuses it', (_case, text) => {
    const accepted = isIdentifier(text);

    expect(accepted).toBe(false);
  });

  it.each([
    ['0', 0],
    ['7', 7],
    [`${MAXIMUM_CHUNK_INDEX}`, MAXIMUM_CHUNK_INDEX],
  ])('chunkIndexOf, given %s, reads the index', (text, index) => {
    const read = chunkIndexOf(text);

    expect(read).toBe(index);
  });

  it.each([['65536'], ['01'], ['-1'], ['1.5'], ['123456'], ['']])('chunkIndexOf, given %s, answers null', (text) => {
    const read = chunkIndexOf(text);

    expect(read).toBeNull();
  });
});
