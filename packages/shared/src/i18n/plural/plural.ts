import { formatMessage, type MessageValues } from '../message-format/message-format';

export type PluralForms = {
  readonly one: string;
  readonly other: string;
};

export const formatPlural = (forms: PluralForms, count: number, values: MessageValues = {}): string =>
  formatMessage(count === 1 ? forms.one : forms.other, { count, ...values });
