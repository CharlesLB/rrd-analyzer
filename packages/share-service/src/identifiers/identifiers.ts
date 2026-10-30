const SESSION_ID_BYTES = 16;
const OWNER_TOKEN_BYTES = 32;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const CHUNK_INDEX_PATTERN = /^(?:0|[1-9][0-9]{0,4})$/;
const PLUS_SIGNS = /\+/g;
const SLASHES = /\//g;
const PADDING = /=+$/;

export const MAXIMUM_CHUNK_INDEX = 65_535;

export const base64UrlOf = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(PLUS_SIGNS, '-')
    .replace(SLASHES, '_')
    .replace(PADDING, '');

const randomIdentifierOf = (byteCount: number): string => base64UrlOf(crypto.getRandomValues(new Uint8Array(byteCount)));

export const newSessionId = (): string => randomIdentifierOf(SESSION_ID_BYTES);

export const newOwnerToken = (): string => randomIdentifierOf(OWNER_TOKEN_BYTES);

export const isIdentifier = (text: string): boolean => IDENTIFIER_PATTERN.test(text);

export const chunkIndexOf = (text: string): number | null => {
  if (!CHUNK_INDEX_PATTERN.test(text)) {
    return null;
  }

  const index = Number(text);

  return index > MAXIMUM_CHUNK_INDEX ? null : index;
};
