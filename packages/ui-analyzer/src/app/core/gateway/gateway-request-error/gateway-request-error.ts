const GATEWAY_REQUEST_ERROR_NAME = 'GatewayRequestError';

export const UNKNOWN_STATUS = 0;

export class GatewayRequestError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = GATEWAY_REQUEST_ERROR_NAME;
    this.status = status;
  }
}

export const statusOfFailure = (failure: unknown): number => (failure instanceof GatewayRequestError ? failure.status : UNKNOWN_STATUS);
