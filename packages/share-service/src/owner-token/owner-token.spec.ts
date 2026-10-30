import { describe, expect, it } from 'vitest';
import { isSameOwnerTokenHash, ownerTokenHashOf, presentedOwnerTokenOf } from './owner-token';

const requestWith = (headers: Record<string, string>): Request => new Request('https://share.example/api/sessions', { headers });

describe('owner token', () => {
  it('presentedOwnerTokenOf, given a bearer authorization, reads the token after the scheme', () => {
    const request = requestWith({ Authorization: 'Bearer abc-123' });

    const token = presentedOwnerTokenOf(request);

    expect(token).toBe('abc-123');
  });

  it.each([
    ['no authorization header', {}],
    ['another scheme', { Authorization: 'Basic abc' }],
  ])('presentedOwnerTokenOf, given %s, answers an empty token', (_case, headers) => {
    const request = requestWith(headers);

    const token = presentedOwnerTokenOf(request);

    expect(token).toBe('');
  });

  it('ownerTokenHashOf, given the same token twice, answers the same 43-character digest, and another for another token', async () => {
    const first = await ownerTokenHashOf('token');
    const again = await ownerTokenHashOf('token');
    const other = await ownerTokenHashOf('other');

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });

  it.each([
    ['the same digest', 'abcdef', 'abcdef', true],
    ['another digest of the same length', 'abcdef', 'abcdeg', false],
    ['a digest of another length', 'abcdef', 'abc', false],
  ])('isSameOwnerTokenHash, given %s, answers %s', (_case, expected, presented, same) => {
    const answer = isSameOwnerTokenHash(expected, presented);

    expect(answer).toBe(same);
  });
});
