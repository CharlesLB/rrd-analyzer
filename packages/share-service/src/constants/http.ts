export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  OPTIONS: 'OPTIONS',
} as const;

export const HTTP_HEADERS = {
  ACCESS_CONTROL_ALLOW_HEADERS: 'Access-Control-Allow-Headers',
  ACCESS_CONTROL_ALLOW_METHODS: 'Access-Control-Allow-Methods',
  ACCESS_CONTROL_ALLOW_ORIGIN: 'Access-Control-Allow-Origin',
  ACCESS_CONTROL_EXPOSE_HEADERS: 'Access-Control-Expose-Headers',
  ACCESS_CONTROL_MAX_AGE: 'Access-Control-Max-Age',
  ALLOW: 'Allow',
  AUTHORIZATION: 'Authorization',
  CACHE_CONTROL: 'Cache-Control',
  CLIENT_ADDRESS: 'CF-Connecting-IP',
  CONTENT_LENGTH: 'Content-Length',
  CONTENT_TYPE: 'Content-Type',
  CONTENT_TYPE_OPTIONS: 'X-Content-Type-Options',
  ORIGIN: 'Origin',
  SESSION_EXPIRES_AT: 'X-Session-Expires-At',
  SESSION_REVISION: 'X-Session-Revision',
  UPGRADE: 'Upgrade',
  VARY: 'Vary',
} as const;

export const MEDIA_TYPES = {
  OCTET_STREAM: 'application/octet-stream',
} as const;

export const WEBSOCKET_UPGRADE = 'websocket';

export const HTTP_STATUSES = {
  CREATED: 201,
  NO_CONTENT: 204,
  SWITCHING_PROTOCOLS: 101,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UPGRADE_REQUIRED: 426,
  TOO_MANY_REQUESTS: 429,
} as const;
