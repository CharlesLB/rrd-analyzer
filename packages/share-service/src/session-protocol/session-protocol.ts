import { HTTP_HEADERS } from '../constants/http';

export const SESSION_PROTOCOL_VERSION = '1';

export const speaksSessionProtocol = (request: Request): boolean => request.headers.get(HTTP_HEADERS.SESSION_PROTOCOL) === SESSION_PROTOCOL_VERSION;
