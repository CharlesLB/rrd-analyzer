import type { ValueOf } from '../../types/value-of';

export const memberOf = <TConstants extends Readonly<Record<string, string>>>(constants: TConstants, candidate: string): ValueOf<TConstants> | undefined =>
  Object.values(constants).find((value): value is ValueOf<TConstants> => value === candidate);
