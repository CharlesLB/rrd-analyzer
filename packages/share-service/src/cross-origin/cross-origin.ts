import { FAILURES, failureResponse } from '../api-response/api-response';
import { HTTP_HEADERS, HTTP_METHODS, HTTP_STATUSES } from '../constants/http';
import type { ServiceSettings } from '../service-settings/service-settings';

const LIST_SEPARATOR = ', ';
const PREFLIGHT_CACHE_SECONDS = '600';
const ALLOWED_METHODS = [HTTP_METHODS.GET, HTTP_METHODS.POST, HTTP_METHODS.PUT, HTTP_METHODS.DELETE].join(LIST_SEPARATOR);
const ALLOWED_HEADERS = [HTTP_HEADERS.AUTHORIZATION, HTTP_HEADERS.CONTENT_TYPE].join(LIST_SEPARATOR);
const EXPOSED_HEADERS = [HTTP_HEADERS.SESSION_REVISION, HTTP_HEADERS.SESSION_EXPIRES_AT].join(LIST_SEPARATOR);

const listedOriginOf = (request: Request, settings: ServiceSettings): string | null => {
  const origin = request.headers.get(HTTP_HEADERS.ORIGIN);

  return origin !== null && settings.allowedOrigins.includes(origin) ? origin : null;
};

export const crossOriginHeadersOf = (request: Request, settings: ServiceSettings): Readonly<Record<string, string>> => {
  const origin = listedOriginOf(request, settings);

  if (origin === null) {
    return {};
  }

  return {
    [HTTP_HEADERS.ACCESS_CONTROL_ALLOW_ORIGIN]: origin,
    [HTTP_HEADERS.ACCESS_CONTROL_EXPOSE_HEADERS]: EXPOSED_HEADERS,
    [HTTP_HEADERS.VARY]: HTTP_HEADERS.ORIGIN,
  };
};

export const preflightResponseOf = (request: Request, settings: ServiceSettings): Response => {
  if (listedOriginOf(request, settings) === null) {
    return failureResponse(FAILURES.ORIGIN_FORBIDDEN);
  }

  return new Response(null, {
    status: HTTP_STATUSES.NO_CONTENT,
    headers: {
      [HTTP_HEADERS.ACCESS_CONTROL_ALLOW_METHODS]: ALLOWED_METHODS,
      [HTTP_HEADERS.ACCESS_CONTROL_ALLOW_HEADERS]: ALLOWED_HEADERS,
      [HTTP_HEADERS.ACCESS_CONTROL_MAX_AGE]: PREFLIGHT_CACHE_SECONDS,
    },
  });
};

export const isSocketOriginAllowed = (request: Request, settings: ServiceSettings): boolean => {
  const origin = request.headers.get(HTTP_HEADERS.ORIGIN);

  return origin === null || origin === new URL(request.url).origin || settings.allowedOrigins.includes(origin);
};
