import { describe, expect, it } from 'vitest';
import { clientNetworkOf } from './client-network';

describe('clientNetworkOf', () => {
  it.each([
    ['an IPv4 address', '198.51.100.7', '198.51.100.7'],
    ['an IPv6 address written in full', '2001:0db8:0000:0042:0000:8a2e:0370:7334', '2001:db8:0:42::/64'],
    ['another interface of the same IPv6 network, written short', '2001:db8:0:42::1', '2001:db8:0:42::/64'],
    ['an IPv6 address in upper case', '2001:DB8:0:42:FFFF::', '2001:db8:0:42::/64'],
    ['an IPv6 address whose network is elided', '::1', '0:0:0:0::/64'],
    ['an IPv6 address eliding groups on both halves of the network', '2001:db8::42:0:0:1', '2001:db8:0:0::/64'],
    ['an IPv4 address mapped into IPv6', '::ffff:198.51.100.7', '::ffff:198.51.100.7'],
    ['an address eliding twice, which is no address', '2001::db8::1', '2001::db8::1'],
    ['an address with a group that is not hexadecimal', '2001:db8:0:zz::1', '2001:db8:0:zz::1'],
    ['an address with too many groups', '1:2:3:4:5:6:7:8:9', '1:2:3:4:5:6:7:8:9'],
  ])('clientNetworkOf, given %s, answers %s', (_case, address, network) => {
    const answer = clientNetworkOf(address);

    expect(answer).toBe(network);
  });
});
