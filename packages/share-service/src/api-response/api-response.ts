import { HTTP_HEADERS, HTTP_STATUSES } from '../constants/http';
import { REFUSALS, type SessionOutcome } from '../session-outcome/session-outcome';

export const FAILURES = {
  ...REFUSALS,
  ROUTE_NOT_FOUND: 'route_not_found',
  CHUNK_NOT_FOUND: 'chunk_not_found',
  METHOD_NOT_ALLOWED: 'method_not_allowed',
  MALFORMED_REQUEST: 'malformed_request',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  RATE_LIMITED: 'rate_limited',
  ORIGIN_FORBIDDEN: 'origin_forbidden',
  UPGRADE_REQUIRED: 'upgrade_required',
} as const;

export type Failure = (typeof FAILURES)[keyof typeof FAILURES];

const FAILURE_STATUSES: Readonly<Record<Failure, number>> = {
  [FAILURES.SESSION_NOT_FOUND]: HTTP_STATUSES.NOT_FOUND,
  [FAILURES.OWNER_TOKEN_REJECTED]: HTTP_STATUSES.FORBIDDEN,
  [FAILURES.SESSION_TOO_LARGE]: HTTP_STATUSES.PAYLOAD_TOO_LARGE,
  [FAILURES.STATE_NOT_PUBLISHED]: HTTP_STATUSES.CONFLICT,
  [FAILURES.ROUTE_NOT_FOUND]: HTTP_STATUSES.NOT_FOUND,
  [FAILURES.CHUNK_NOT_FOUND]: HTTP_STATUSES.NOT_FOUND,
  [FAILURES.METHOD_NOT_ALLOWED]: HTTP_STATUSES.METHOD_NOT_ALLOWED,
  [FAILURES.MALFORMED_REQUEST]: HTTP_STATUSES.BAD_REQUEST,
  [FAILURES.PAYLOAD_TOO_LARGE]: HTTP_STATUSES.PAYLOAD_TOO_LARGE,
  [FAILURES.RATE_LIMITED]: HTTP_STATUSES.TOO_MANY_REQUESTS,
  [FAILURES.ORIGIN_FORBIDDEN]: HTTP_STATUSES.FORBIDDEN,
  [FAILURES.UPGRADE_REQUIRED]: HTTP_STATUSES.UPGRADE_REQUIRED,
};

const API_HEADERS = {
  [HTTP_HEADERS.CACHE_CONTROL]: 'no-store',
  [HTTP_HEADERS.CONTENT_TYPE_OPTIONS]: 'nosniff',
} as const;

export const failureResponse = (failure: Failure, headers: Readonly<Record<string, string>> = {}): Response =>
  Response.json({ error: failure }, { status: FAILURE_STATUSES[failure], headers });

export const outcomeResponse = <TValue>(outcome: SessionOutcome<TValue>, respond: (value: TValue) => Response): Response =>
  outcome.refusal === null ? respond(outcome.value) : failureResponse(outcome.refusal);

export const finalizedResponse = (response: Response, crossOriginHeaders: Readonly<Record<string, string>>): Response => {
  if (response.webSocket !== null) {
    return response;
  }

  const headers = new Headers([...response.headers.entries(), ...Object.entries(API_HEADERS), ...Object.entries(crossOriginHeaders)]);

  return new Response(response.body, { status: response.status, headers });
};
