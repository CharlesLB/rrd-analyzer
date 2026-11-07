const IPV6_GROUP_SEPARATOR = ':';
const IPV6_ELISION = '::';
const IPV4_SEPARATOR = '.';
const IPV6_GROUP_COUNT = 8;
const NETWORK_GROUP_COUNT = 4;
const HEXADECIMAL = 16;
const ZERO_GROUP = '0';
const NETWORK_SUFFIX = '::/64';
const IPV6_GROUP = /^[0-9a-f]{1,4}$/i;
const NOT_FOUND = -1;

const groupsOf = (part: string): readonly string[] => (part === '' ? [] : part.split(IPV6_GROUP_SEPARATOR));

const expandedGroupsOf = (address: string): readonly string[] => {
  const elisionAt = address.indexOf(IPV6_ELISION);

  if (elisionAt === NOT_FOUND) {
    return groupsOf(address);
  }

  const headGroups = groupsOf(address.slice(0, elisionAt));
  const tailGroups = groupsOf(address.slice(elisionAt + IPV6_ELISION.length));
  const elidedGroups = Array.from({ length: IPV6_GROUP_COUNT - headGroups.length - tailGroups.length }, () => ZERO_GROUP);

  return [...headGroups, ...elidedGroups, ...tailGroups];
};

const isIpv6 = (groups: readonly string[]): boolean => groups.length === IPV6_GROUP_COUNT && groups.every((group) => IPV6_GROUP.test(group));

const canonicalGroupOf = (group: string): string => Number.parseInt(group, HEXADECIMAL).toString(HEXADECIMAL);

export const clientNetworkOf = (address: string): string => {
  if (!address.includes(IPV6_GROUP_SEPARATOR) || address.includes(IPV4_SEPARATOR)) {
    return address;
  }

  const groups = expandedGroupsOf(address);

  if (!isIpv6(groups)) {
    return address;
  }

  return `${groups.slice(0, NETWORK_GROUP_COUNT).map(canonicalGroupOf).join(IPV6_GROUP_SEPARATOR)}${NETWORK_SUFFIX}`;
};
