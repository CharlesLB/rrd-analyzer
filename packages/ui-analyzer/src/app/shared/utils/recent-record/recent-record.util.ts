import * as R from 'remeda';

export type RecentRecord<TValue> = Readonly<Record<string, TValue>>;

export const rememberedIn = <TValue>(record: RecentRecord<TValue>, key: string, value: TValue, capacity: number): RecentRecord<TValue> =>
  R.fromEntries(R.takeLast([...R.entries(R.omit(record, [key])), [key, value] as const], capacity));
