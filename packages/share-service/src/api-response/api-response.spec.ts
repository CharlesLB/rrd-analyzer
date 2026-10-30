import { describe, expect, it } from 'vitest';
import { done, refused } from '../session-outcome/session-outcome';
import { FAILURES, failureResponse, finalizedResponse, outcomeResponse } from './api-response';

describe('api response', () => {
  it('failureResponse, given a failure, answers its status and names it in the body', async () => {
    const response = failureResponse(FAILURES.STATE_NOT_PUBLISHED);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'state_not_published' });
  });

  it('outcomeResponse, given a refusal, answers the refusal', () => {
    const response = outcomeResponse(refused(FAILURES.OWNER_TOKEN_REJECTED), () => new Response('unreached'));

    expect(response.status).toBe(403);
  });

  it('outcomeResponse, given a value, answers what the value is turned into', async () => {
    const response = outcomeResponse(done('kept'), (value) => new Response(value));

    expect(await response.text()).toBe('kept');
  });

  it('finalizedResponse, given an ordinary response, keeps its status, headers and body and adds the API and cross-origin headers', async () => {
    const response = new Response('body', { status: 201, headers: { 'Content-Type': 'text/plain' } });

    const finalized = finalizedResponse(response, { Vary: 'Origin' });

    expect(finalized.status).toBe(201);
    expect(await finalized.text()).toBe('body');
    expect(finalized.headers.get('Content-Type')).toBe('text/plain');
    expect(finalized.headers.get('Cache-Control')).toBe('no-store');
    expect(finalized.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(finalized.headers.get('Vary')).toBe('Origin');
  });

  it('finalizedResponse, given a WebSocket handshake, answers it untouched', () => {
    const [client] = Object.values(new WebSocketPair());
    const handshake = new Response(null, { status: 101, webSocket: client });

    const finalized = finalizedResponse(handshake, { Vary: 'Origin' });

    expect(finalized).toBe(handshake);
  });
});
