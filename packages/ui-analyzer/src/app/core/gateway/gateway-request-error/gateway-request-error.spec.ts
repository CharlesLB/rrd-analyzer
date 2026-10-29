import { describe, expect, it } from 'vitest';
import { GatewayRequestError, statusOfFailure, UNKNOWN_STATUS } from './gateway-request-error';

describe('GatewayRequestError', () => {
  it('statusOfFailure, given a failed request, answers the status the request failed with', () => {
    const failure = new GatewayRequestError('GET /api/sessions failed: 404', 404);

    const status = statusOfFailure(failure);

    expect(status).toBe(404);
    expect(failure.message).toBe('GET /api/sessions failed: 404');
    expect(failure.name).toBe('GatewayRequestError');
  });

  it('statusOfFailure, given any other failure, answers the unknown status', () => {
    const status = statusOfFailure(new Error('the analyzer could not be loaded in this browser'));

    expect(status).toBe(UNKNOWN_STATUS);
  });
});
