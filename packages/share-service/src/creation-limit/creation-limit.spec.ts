import { describe, expect, it } from 'vitest';
import { isCreationAllowed } from './creation-limit';

const limiterAnswering = (success: boolean, keys: string[]): RateLimit => ({
  limit: async (options) => {
    keys.push(options.key);

    return { success };
  },
});

describe('isCreationAllowed', () => {
  it('without a limiter bound, allows every creation', async () => {
    const request = new Request('https://share.example/api/sessions', { method: 'POST' });

    const allowed = await isCreationAllowed(undefined, request);

    expect(allowed).toBe(true);
  });

  it('with a limiter, asks it about the client address and answers what it says', async () => {
    const keys: string[] = [];
    const request = new Request('https://share.example/api/sessions', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' } });

    const allowed = await isCreationAllowed(limiterAnswering(false, keys), request);

    expect(allowed).toBe(false);
    expect(keys).toEqual(['192.0.2.1']);
  });

  it('with a limiter, for two addresses of one IPv6 network, counts both under the network', async () => {
    const keys: string[] = [];

    const requests = ['2001:db8:7:9::1', '2001:db8:7:9:ffff:ffff:ffff:ffff'].map(
      (address) => new Request('https://share.example/api/sessions', { method: 'POST', headers: { 'CF-Connecting-IP': address } }),
    );

    await Promise.all(requests.map(async (request) => await isCreationAllowed(limiterAnswering(true, keys), request)));

    expect(keys).toEqual(['2001:db8:7:9::/64', '2001:db8:7:9::/64']);
  });

  it('with a limiter, for a request with no client address, counts it under one shared key', async () => {
    const keys: string[] = [];
    const request = new Request('https://share.example/api/sessions', { method: 'POST' });

    const allowed = await isCreationAllowed(limiterAnswering(true, keys), request);

    expect(allowed).toBe(true);
    expect(keys).toEqual(['unknown']);
  });
});
