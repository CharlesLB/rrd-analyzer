import { GatewayRequestError } from './gateway-request-error';

export const failingWith = (status: number): GatewayRequestError => new GatewayRequestError(`failed: ${status}`, status);
