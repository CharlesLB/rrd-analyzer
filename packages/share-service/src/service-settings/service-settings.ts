import * as R from 'remeda';
import type { CountVariable, ServiceEnvironment } from '../config/service-environment';

export type ServiceSettings = {
  readonly maximumChunkBytes: number;
  readonly maximumStateBytes: number;
  readonly maximumSessionBytes: number;
  readonly maximumSessionFiles: number;
  readonly inactivityMilliseconds: number;
  readonly allowedOrigins: readonly string[];
};

type CountedSetting = 'MAXIMUM_CHUNK_BYTES' | 'MAXIMUM_STATE_BYTES' | 'MAXIMUM_SESSION_BYTES' | 'MAXIMUM_SESSION_FILES' | 'INACTIVITY_MILLISECONDS';

const ORIGIN_SEPARATOR = ',';
const WHOLE_NUMBER_TEXT = /^\d+$/;

const numberOf = (variable: CountVariable): number => {
  if (typeof variable === 'number') {
    return variable;
  }

  return WHOLE_NUMBER_TEXT.test(variable) ? Number(variable) : Number.NaN;
};

const countIn = (environment: ServiceEnvironment, setting: CountedSetting): number => {
  const value = numberOf(environment[setting]);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${setting} must be a positive whole number, and it is ${String(environment[setting])}`);
  }

  return value;
};

const allowedOriginsIn = (environment: ServiceEnvironment): readonly string[] =>
  R.pipe(
    environment.ALLOWED_ORIGINS.split(ORIGIN_SEPARATOR),
    R.map((origin) => origin.trim()),
    R.filter(R.isTruthy),
  );

export const settingsOf = (environment: ServiceEnvironment): ServiceSettings => ({
  maximumChunkBytes: countIn(environment, 'MAXIMUM_CHUNK_BYTES'),
  maximumStateBytes: countIn(environment, 'MAXIMUM_STATE_BYTES'),
  maximumSessionBytes: countIn(environment, 'MAXIMUM_SESSION_BYTES'),
  maximumSessionFiles: countIn(environment, 'MAXIMUM_SESSION_FILES'),
  inactivityMilliseconds: countIn(environment, 'INACTIVITY_MILLISECONDS'),
  allowedOrigins: allowedOriginsIn(environment),
});
