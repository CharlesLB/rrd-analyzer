import { FAILURES, failureResponse, finalizedResponse, outcomeResponse } from '../api-response/api-response';
import { API_ROUTE_KINDS, type ApiRoute, apiRouteOf } from '../api-route/api-route';
import { chunkKeyOf, stateKeyOf } from '../blob-keys/blob-keys';
import { boundedBodyOf } from '../bounded-body/bounded-body';
import type { ServiceEnvironment } from '../config/service-environment';
import { HTTP_HEADERS, HTTP_METHODS, HTTP_STATUSES, MEDIA_TYPES, WEBSOCKET_UPGRADE } from '../constants/http';
import { isCreationAllowed } from '../creation-limit/creation-limit';
import { crossOriginHeadersOf, isSocketOriginAllowed, preflightResponseOf } from '../cross-origin/cross-origin';
import { newOwnerToken, newSessionId } from '../identifiers/identifiers';
import type { LiveSession, StateUpload } from '../live-session/live-session';
import { ownerTokenHashOf, presentedOwnerTokenOf } from '../owner-token/owner-token';
import type { ServiceSettings } from '../service-settings/service-settings';
import { settingsOf } from '../service-settings/service-settings';
import type { SessionTiming } from '../session-record/session-record';

type ApiCall = {
  readonly request: Request;
  readonly environment: ServiceEnvironment;
  readonly settings: ServiceSettings;
};

type RouteOf<TKind extends ApiRoute['kind']> = Extract<ApiRoute, { readonly kind: TKind }>;

type MethodHandlers = Readonly<Partial<Record<string, () => Promise<Response>>>>;

const ALLOWED_METHODS_SEPARATOR = ', ';

const liveSessionOf = (call: ApiCall, sessionId: string): DurableObjectStub<LiveSession> =>
  call.environment.LIVE_SESSIONS.get(call.environment.LIVE_SESSIONS.idFromName(sessionId));

const presentedOwnerTokenHashOf = async (request: Request): Promise<string> => await ownerTokenHashOf(presentedOwnerTokenOf(request));

const ownerUploadOf = async (call: ApiCall, maximumBytes: number): Promise<StateUpload | null> => {
  const content = await boundedBodyOf(call.request, maximumBytes);

  return content === null ? null : { ownerTokenHash: await presentedOwnerTokenHashOf(call.request), content };
};

const noContent = (): Response => new Response(null, { status: HTTP_STATUSES.NO_CONTENT });

const timingResponse = (timing: SessionTiming): Response => Response.json(timing);

const sealedBlobResponse = (blob: R2ObjectBody, headers: Readonly<Record<string, string>> = {}): Response =>
  new Response(blob.body, { headers: { [HTTP_HEADERS.CONTENT_TYPE]: MEDIA_TYPES.OCTET_STREAM, ...headers } });

const createSession = async (call: ApiCall): Promise<Response> => {
  if (!(await isCreationAllowed(call.environment.SESSION_CREATION_LIMITER, call.request))) {
    return failureResponse(FAILURES.RATE_LIMITED);
  }

  const sessionId = newSessionId();
  const ownerToken = newOwnerToken();
  const timing = await liveSessionOf(call, sessionId).create(sessionId, await ownerTokenHashOf(ownerToken));

  return Response.json({ sessionId, ownerToken, expiresAtMilliseconds: timing.expiresAtMilliseconds }, { status: HTTP_STATUSES.CREATED });
};

const readStatus = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.SESSION>): Promise<Response> =>
  outcomeResponse(await liveSessionOf(call, route.sessionId).status(), timingResponse);

const endSession = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.SESSION>): Promise<Response> =>
  outcomeResponse(await liveSessionOf(call, route.sessionId).end(await presentedOwnerTokenHashOf(call.request)), noContent);

const publishState = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.STATE>): Promise<Response> => {
  const upload = await ownerUploadOf(call, call.settings.maximumStateBytes);

  if (upload === null) {
    return failureResponse(FAILURES.PAYLOAD_TOO_LARGE);
  }

  return outcomeResponse(await liveSessionOf(call, route.sessionId).storeState(upload), timingResponse);
};

const sealedStateResponse = async (call: ApiCall, sessionId: string, timing: SessionTiming): Promise<Response> => {
  const sealedState = await call.environment.SESSION_BLOBS.get(stateKeyOf(sessionId));

  if (sealedState === null) {
    return failureResponse(FAILURES.STATE_NOT_PUBLISHED);
  }

  return sealedBlobResponse(sealedState, {
    [HTTP_HEADERS.SESSION_REVISION]: String(timing.revision),
    [HTTP_HEADERS.SESSION_EXPIRES_AT]: String(timing.expiresAtMilliseconds),
  });
};

const readState = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.STATE>): Promise<Response> => {
  const opened = await liveSessionOf(call, route.sessionId).openState();

  return opened.refusal === null ? await sealedStateResponse(call, route.sessionId, opened.value) : failureResponse(opened.refusal);
};

const openLiveChannel = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.LIVE>): Promise<Response> => {
  if (call.request.headers.get(HTTP_HEADERS.UPGRADE)?.toLowerCase() !== WEBSOCKET_UPGRADE) {
    return failureResponse(FAILURES.UPGRADE_REQUIRED);
  }

  if (!isSocketOriginAllowed(call.request, call.settings)) {
    return failureResponse(FAILURES.ORIGIN_FORBIDDEN);
  }

  return await liveSessionOf(call, route.sessionId).fetch(call.request);
};

const storeChunk = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.CHUNK>): Promise<Response> => {
  const upload = await ownerUploadOf(call, call.settings.maximumChunkBytes);

  if (upload === null) {
    return failureResponse(FAILURES.PAYLOAD_TOO_LARGE);
  }

  return outcomeResponse(await liveSessionOf(call, route.sessionId).storeChunk({ ...upload, fileId: route.fileId, index: route.index }), noContent);
};

const readChunk = async (call: ApiCall, route: RouteOf<typeof API_ROUTE_KINDS.CHUNK>): Promise<Response> => {
  const sealedChunk = await call.environment.SESSION_BLOBS.get(chunkKeyOf(route));

  return sealedChunk === null ? failureResponse(FAILURES.CHUNK_NOT_FOUND) : sealedBlobResponse(sealedChunk);
};

const byMethod = async (request: Request, handlers: MethodHandlers): Promise<Response> => {
  const handler = handlers[request.method];

  if (handler === undefined) {
    return failureResponse(FAILURES.METHOD_NOT_ALLOWED, { [HTTP_HEADERS.ALLOW]: Object.keys(handlers).join(ALLOWED_METHODS_SEPARATOR) });
  }

  return await handler();
};

const routed = async (call: ApiCall, route: ApiRoute): Promise<Response> => {
  switch (route.kind) {
    case API_ROUTE_KINDS.SESSIONS:
      return await byMethod(call.request, { [HTTP_METHODS.POST]: async () => await createSession(call) });
    case API_ROUTE_KINDS.SESSION:
      return await byMethod(call.request, {
        [HTTP_METHODS.GET]: async () => await readStatus(call, route),
        [HTTP_METHODS.DELETE]: async () => await endSession(call, route),
      });
    case API_ROUTE_KINDS.STATE:
      return await byMethod(call.request, {
        [HTTP_METHODS.GET]: async () => await readState(call, route),
        [HTTP_METHODS.PUT]: async () => await publishState(call, route),
      });
    case API_ROUTE_KINDS.LIVE:
      return await byMethod(call.request, { [HTTP_METHODS.GET]: async () => await openLiveChannel(call, route) });
    case API_ROUTE_KINDS.CHUNK:
      return await byMethod(call.request, {
        [HTTP_METHODS.GET]: async () => await readChunk(call, route),
        [HTTP_METHODS.PUT]: async () => await storeChunk(call, route),
      });
    case API_ROUTE_KINDS.MALFORMED:
      return failureResponse(FAILURES.MALFORMED_REQUEST);
    case API_ROUTE_KINDS.UNKNOWN:
      return failureResponse(FAILURES.ROUTE_NOT_FOUND);
  }
};

export const serveSessionApi = async (request: Request, environment: ServiceEnvironment): Promise<Response> => {
  const settings = settingsOf(environment);
  const call = { request, environment, settings };

  const response =
    request.method === HTTP_METHODS.OPTIONS ? preflightResponseOf(request, settings) : await routed(call, apiRouteOf(new URL(request.url).pathname));

  return finalizedResponse(response, crossOriginHeadersOf(request, settings));
};
