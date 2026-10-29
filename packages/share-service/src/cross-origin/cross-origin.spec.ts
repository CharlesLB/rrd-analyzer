import { describe, expect, it } from 'vitest';
import type { ServiceSettings } from '../service-settings/service-settings';
import { crossOriginHeadersOf, isSocketOriginAllowed } from './cross-origin';

const SETTINGS: ServiceSettings = {
  maximumChunkBytes: 1,
  maximumStateBytes: 1,
  maximumSessionBytes: 1,
  maximumSessionFiles: 1,
  maximumSessionChunks: 2,
  inactivityMilliseconds: 1,
  renewalStepMilliseconds: 1,
  allowedOrigins: ['http://127.0.0.1:4210'],
};

const requestFrom = (origin: string | null): Request =>
  new Request('https://share.example/api/sessions/x/live', { headers: origin === null ? {} : { Origin: origin } });

describe('cross origin', () => {
  it.each([
    ['no origin, as a native client sends', null, true],
    ['the service own origin', 'https://share.example', true],
    ['an allowed development origin', 'http://127.0.0.1:4210', true],
    ['any other origin', 'https://elsewhere.example', false],
  ])('isSocketOriginAllowed, given %s, answers %s', (_case, origin, allowed) => {
    const request = requestFrom(origin);

    const answer = isSocketOriginAllowed(request, SETTINGS);

    expect(answer).toBe(allowed);
  });

  it('crossOriginHeadersOf, given an allowed origin, grants it and exposes the session headers', () => {
    const request = requestFrom('http://127.0.0.1:4210');

    const headers = crossOriginHeadersOf(request, SETTINGS);

    expect(headers).toEqual({
      'Access-Control-Allow-Origin': 'http://127.0.0.1:4210',
      'Access-Control-Expose-Headers': 'X-Session-Revision, X-Session-Expires-At',
      Vary: 'Origin',
    });
  });

  it.each([
    ['no origin', null],
    ['an origin that is not allowed', 'https://elsewhere.example'],
  ])('crossOriginHeadersOf, given %s, grants nothing', (_case, origin) => {
    const request = requestFrom(origin);

    const headers = crossOriginHeadersOf(request, SETTINGS);

    expect(headers).toEqual({});
  });
});
