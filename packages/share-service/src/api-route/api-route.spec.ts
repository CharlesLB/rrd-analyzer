import { describe, expect, it } from 'vitest';
import { apiRouteOf } from './api-route';

const SESSION = 'AAAAAAAAAAAAAAAAAAAAAA';
const FILE = 'BBBBBBBBBBBBBBBBBBBBBB';

describe('apiRouteOf', () => {
  it.each([
    ['/api/sessions', { kind: 'sessions' }],
    [`/api/sessions/${SESSION}`, { kind: 'session', sessionId: SESSION }],
    [`/api/sessions/${SESSION}/state`, { kind: 'state', sessionId: SESSION }],
    [`/api/sessions/${SESSION}/live`, { kind: 'live', sessionId: SESSION }],
    [`/api/sessions/${SESSION}/files/${FILE}/chunks/12`, { kind: 'chunk', sessionId: SESSION, fileId: FILE, index: 12 }],
    ['/api/sessions/', { kind: 'malformed' }],
    ['/api/sessions/short/state', { kind: 'malformed' }],
    [`/api/sessions/${SESSION}/files/short/chunks/0`, { kind: 'malformed' }],
    [`/api/sessions/${SESSION}/files/${FILE}/chunks/x`, { kind: 'malformed' }],
    [`/api/sessions/${SESSION}/constructor`, { kind: 'unknown' }],
    [`/api/sessions/${SESSION}/state/more`, { kind: 'unknown' }],
    [`/api/sessions/${SESSION}/files/${FILE}/parts/0`, { kind: 'unknown' }],
    [`/api/sessions/${SESSION}/blobs/${FILE}/chunks/0`, { kind: 'unknown' }],
    ['/api/other', { kind: 'unknown' }],
    ['/app/index.html', { kind: 'unknown' }],
  ])('given %s, reads %j', (pathname, route) => {
    const read = apiRouteOf(pathname);

    expect(read).toEqual(route);
  });
});
