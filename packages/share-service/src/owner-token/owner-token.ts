import { HTTP_HEADERS } from '../constants/http';
import { base64UrlOf } from '../identifiers/identifiers';

const BEARER_PREFIX = 'Bearer ';
const HASH_ALGORITHM = 'SHA-256';
const NO_TOKEN = '';

const textEncoder = new TextEncoder();

export const presentedOwnerTokenOf = (request: Request): string => {
  const authorization = request.headers.get(HTTP_HEADERS.AUTHORIZATION) ?? NO_TOKEN;

  return authorization.startsWith(BEARER_PREFIX) ? authorization.slice(BEARER_PREFIX.length) : NO_TOKEN;
};

export const ownerTokenHashOf = async (token: string): Promise<string> =>
  base64UrlOf(new Uint8Array(await crypto.subtle.digest(HASH_ALGORITHM, textEncoder.encode(token))));

export const isSameOwnerTokenHash = (expected: string, presented: string): boolean => {
  const expectedBytes = textEncoder.encode(expected);
  const presentedBytes = textEncoder.encode(presented);

  return expectedBytes.byteLength === presentedBytes.byteLength && crypto.subtle.timingSafeEqual(expectedBytes, presentedBytes);
};
