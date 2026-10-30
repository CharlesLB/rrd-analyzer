import { isHexColor } from '../../../../shared/utils/color-space/color-space.util';
import { LOG_ROLES, type LogMapping } from '../log-mapping/log-mapping';
import type { TypeColors } from '../log-severity/log-severity';
import { isLogRecord } from '../log-source/log-source';

export type LogView = {
  readonly mapping: LogMapping | null;
  readonly chosenColors: TypeColors;
  readonly hiddenTypes: ReadonlySet<string>;
  readonly isShown: boolean;
};

export type OpenLog = {
  readonly file: File;
  readonly view: LogView;
};

export type WrittenLogView = {
  readonly mapping: LogMapping | null;
  readonly chosenColors: readonly (readonly [string, string])[];
  readonly hiddenTypes: readonly string[];
  readonly isShown: boolean;
};

type MappingReading = { readonly isReadable: true; readonly mapping: LogMapping | null } | { readonly isReadable: false };

const UNREADABLE_MAPPING: MappingReading = { isReadable: false };
const COLOR_PAIR_LENGTH = 2;

const isText = (value: unknown): value is string => typeof value === 'string';

const isColorChoice = (value: unknown): value is readonly [string, string] =>
  Array.isArray(value) && value.length === COLOR_PAIR_LENGTH && isText(value[0]) && isText(value[1]) && isHexColor(value[1]);

const isListOf = <TItem>(value: unknown, isItem: (item: unknown) => item is TItem): value is readonly TItem[] => Array.isArray(value) && value.every(isItem);

const readMapping = (value: unknown): MappingReading => {
  if (value === null) {
    return { isReadable: true, mapping: null };
  }

  if (!isLogRecord(value)) {
    return UNREADABLE_MAPPING;
  }

  const timestamp = value[LOG_ROLES.TIMESTAMP];
  const type = value[LOG_ROLES.TYPE];
  const message = value[LOG_ROLES.MESSAGE];

  if (!isText(timestamp) || !isText(type) || !isText(message)) {
    return UNREADABLE_MAPPING;
  }

  return { isReadable: true, mapping: { [LOG_ROLES.TIMESTAMP]: timestamp, [LOG_ROLES.TYPE]: type, [LOG_ROLES.MESSAGE]: message } };
};

export const writtenLogView = (view: LogView): WrittenLogView => ({
  mapping: view.mapping,
  chosenColors: [...view.chosenColors],
  hiddenTypes: [...view.hiddenTypes],
  isShown: view.isShown,
});

export const readLogView = (written: unknown): LogView | null => {
  if (!isLogRecord(written)) {
    return null;
  }

  const { mapping, chosenColors, hiddenTypes, isShown } = written;
  const reading = readMapping(mapping);

  if (!reading.isReadable || !isListOf(chosenColors, isColorChoice) || !isListOf(hiddenTypes, isText) || typeof isShown !== 'boolean') {
    return null;
  }

  return { mapping: reading.mapping, chosenColors: new Map(chosenColors), hiddenTypes: new Set(hiddenTypes), isShown };
};
