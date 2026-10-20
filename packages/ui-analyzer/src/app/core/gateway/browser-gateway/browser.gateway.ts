import { Service } from '@angular/core';
import { DEVELOPMENT_API_BASE_URL } from '../../config/api.config';
import type { PickedFileDto } from '../analyzer.dto';
import { type ApiCall, ApiGateway, type ApiTransport, HTTP_METHODS } from '../api-gateway/api.gateway';

const JSON_CONTENT_TYPE = 'application/json';
const NO_PATH_IN_A_BROWSER = '';

const sendToTheDevelopmentServer = async (call: ApiCall): Promise<Response> =>
  await fetch(`${DEVELOPMENT_API_BASE_URL}${call.path}`, {
    method: call.method,
    headers: call.body === undefined ? undefined : { 'Content-Type': JSON_CONTENT_TYPE },
    body: call.body === undefined ? undefined : JSON.stringify(call.body),
    signal: call.cancellation,
    keepalive: call.method === HTTP_METHODS.DELETE,
  });

const describeByNameAlone = async (files: readonly File[]): Promise<readonly PickedFileDto[]> =>
  files.map((file) => ({ name: file.name, path: NO_PATH_IN_A_BROWSER, size: file.size }));

const DEVELOPMENT_SERVER_TRANSPORT: ApiTransport = { send: sendToTheDevelopmentServer, describeFiles: describeByNameAlone };

@Service()
export class BrowserGateway extends ApiGateway {
  public constructor() {
    super(DEVELOPMENT_SERVER_TRANSPORT);
  }
}
