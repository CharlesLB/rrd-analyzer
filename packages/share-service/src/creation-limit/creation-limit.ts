import { HTTP_HEADERS } from '../constants/http';

const UNKNOWN_CLIENT_ADDRESS = 'unknown';

export const isCreationAllowed = async (limiter: RateLimit | undefined, request: Request): Promise<boolean> => {
  if (limiter === undefined) {
    return true;
  }

  const outcome = await limiter.limit({ key: request.headers.get(HTTP_HEADERS.CLIENT_ADDRESS) ?? UNKNOWN_CLIENT_ADDRESS });

  return outcome.success;
};
