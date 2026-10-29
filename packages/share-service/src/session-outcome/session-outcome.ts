export const REFUSALS = {
  SESSION_NOT_FOUND: 'session_not_found',
  OWNER_TOKEN_REJECTED: 'owner_token_rejected',
  SESSION_TOO_LARGE: 'session_too_large',
  STATE_NOT_PUBLISHED: 'state_not_published',
} as const;

export type Refusal = (typeof REFUSALS)[keyof typeof REFUSALS];

export type SessionOutcome<TValue> = { readonly refusal: null; readonly value: TValue } | { readonly refusal: Refusal; readonly value: null };

export const done = <TValue>(value: TValue): SessionOutcome<TValue> => ({ refusal: null, value });

export const refused = <TValue>(refusal: Refusal): SessionOutcome<TValue> => ({ refusal, value: null });
