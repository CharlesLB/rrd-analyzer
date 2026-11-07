import { describe, expect, it } from 'vitest';
import { speaksSessionProtocol } from './session-protocol';

const requestWith = (headers: Record<string, string>): Request => new Request('https://share.example/api/sessions/x/state', { headers });

describe('speaksSessionProtocol', () => {
  it.each([
    ['the protocol header at version 1, as the app sends it', { 'X-Session-Protocol': '1' }, true],
    ['no protocol header, as a link opened in a browser sends', {}, false],
    ['the protocol header at another version', { 'X-Session-Protocol': '2' }, false],
  ])('speaksSessionProtocol, given %s, answers %s', (_case, headers, speaks) => {
    const request = requestWith(headers);

    const answer = speaksSessionProtocol(request);

    expect(answer).toBe(speaks);
  });
});
