import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ServiceEnvironment } from '../config/service-environment';
import { settingsOf } from './service-settings';

const environmentWith = (overrides: Partial<ServiceEnvironment>): ServiceEnvironment => ({ ...env, ...overrides });

describe('settingsOf', () => {
  it('given the configured variables, reads every limit and the origins, trimmed and without blanks', () => {
    const environment = environmentWith({ ALLOWED_ORIGINS: ' http://a.example , ,http://b.example' });

    const settings = settingsOf(environment);

    expect(settings).toEqual({
      maximumChunkBytes: 64,
      maximumStateBytes: 48,
      maximumSessionBytes: 160,
      maximumSessionFiles: 3,
      maximumSessionChunks: 6,
      inactivityMilliseconds: 3_600_000,
      renewalStepMilliseconds: 60_000,
      allowedOrigins: ['http://a.example', 'http://b.example'],
    });
  });

  it('given the limits, lets a session hold one chunk per file plus as many full chunks as its bytes fill, and renews at most once a sixtieth of the window', () => {
    const environment = environmentWith({
      MAXIMUM_SESSION_FILES: 256,
      MAXIMUM_SESSION_BYTES: 268_435_456,
      MAXIMUM_CHUNK_BYTES: 8_388_636,
      INACTIVITY_MILLISECONDS: 15_000,
    });

    const settings = settingsOf(environment);

    expect(settings.maximumSessionChunks).toBe(288);
    expect(settings.renewalStepMilliseconds).toBe(250);
  });

  it('given no allowed origins, allows none', () => {
    const environment = environmentWith({ ALLOWED_ORIGINS: '' });

    const settings = settingsOf(environment);

    expect(settings.allowedOrigins).toEqual([]);
  });

  it('given limits written as text, the way the command line and the dashboard hand them over, reads them as numbers', () => {
    const environment = environmentWith({ MAXIMUM_SESSION_FILES: '7', INACTIVITY_MILLISECONDS: '15000' });

    const settings = settingsOf(environment);

    expect(settings.maximumSessionFiles).toBe(7);
    expect(settings.inactivityMilliseconds).toBe(15_000);
  });

  it.each([
    ['zero', 0],
    ['a fraction', 1.5],
    ['a number read from text', Number.NaN],
    ['zero written as text', '0'],
    ['a fraction written as text', '1.5'],
    ['a negative number written as text', '-5'],
    ['text that is no number', 'an hour'],
    ['empty text', ''],
  ])('given a limit of %s, refuses to start', (_case, value) => {
    const environment = environmentWith({ MAXIMUM_CHUNK_BYTES: value });

    const reading = (): unknown => settingsOf(environment);

    expect(reading).toThrow('MAXIMUM_CHUNK_BYTES must be a positive whole number');
  });
});
