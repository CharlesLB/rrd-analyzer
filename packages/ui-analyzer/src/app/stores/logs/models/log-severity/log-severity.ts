import * as R from 'remeda';
import { LOG_EXTRA_TYPE_COLORS, LOG_TYPE_COLORS } from '../../../../shared/constants/colors';

type Severity = {
  readonly names: RegExp;
  readonly color: string;
};

export type TypeColors = ReadonlyMap<string, string>;

export const UNKNOWN_LOG_TYPE = 'unknown';

const SEVERITIES: readonly Severity[] = [
  { names: /^(fatal|panic|crit|critical|emerg|emergency|alert)$/i, color: LOG_TYPE_COLORS.fatal },
  { names: /^(err|error|severe|failure)$/i, color: LOG_TYPE_COLORS.error },
  { names: /^(warn|warning)$/i, color: LOG_TYPE_COLORS.warning },
  { names: /^(info|information|informational|notice)$/i, color: LOG_TYPE_COLORS.info },
  { names: /^(debug|trace|verbose|dbg)$/i, color: LOG_TYPE_COLORS.debug },
];

const UNRANKED = SEVERITIES.length;
const FIRST_EXTRA_COLOR = LOG_EXTRA_TYPE_COLORS[0];

export const severityRankOf = (type: string): number => {
  const rank = SEVERITIES.findIndex((severity) => severity.names.test(type.trim()));

  return rank < 0 ? UNRANKED : rank;
};

export const isSeverityName = (type: string): boolean => severityRankOf(type) !== UNRANKED;

const isKnownType = (type: string): boolean => isSeverityName(type) || type === UNKNOWN_LOG_TYPE;

const knownColorOf = (type: string): string => SEVERITIES[severityRankOf(type)]?.color ?? LOG_TYPE_COLORS.unknown;

export const defaultTypeColorsOf = (types: readonly string[]): TypeColors => {
  const extras = R.filter(types, (type) => !isKnownType(type));
  const extraColorOf = (type: string): string => LOG_EXTRA_TYPE_COLORS[extras.indexOf(type) % LOG_EXTRA_TYPE_COLORS.length] ?? FIRST_EXTRA_COLOR;

  return new Map(R.map(types, (type) => [type, isKnownType(type) ? knownColorOf(type) : extraColorOf(type)]));
};

export const typeColorsOf = (types: readonly string[], chosen: TypeColors): TypeColors => new Map([...defaultTypeColorsOf(types), ...chosen]);

export const colorOfType = (colors: TypeColors, type: string): string => colors.get(type) ?? LOG_TYPE_COLORS.unknown;
