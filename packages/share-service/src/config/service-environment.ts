import type { LiveSession } from '../live-session/live-session';

export type CountVariable = number | string;

export type ServiceEnvironment = {
  readonly LIVE_SESSIONS: DurableObjectNamespace<LiveSession>;
  readonly SESSION_BLOBS: R2Bucket;
  readonly SESSION_CREATION_LIMITER?: RateLimit;
  readonly MAXIMUM_CHUNK_BYTES: CountVariable;
  readonly MAXIMUM_STATE_BYTES: CountVariable;
  readonly MAXIMUM_SESSION_BYTES: CountVariable;
  readonly MAXIMUM_SESSION_FILES: CountVariable;
  readonly INACTIVITY_MILLISECONDS: CountVariable;
  readonly ALLOWED_ORIGINS: string;
};
