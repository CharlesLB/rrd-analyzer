import { describe, expect, it } from 'vitest';
import { LOG_EXTRA_TYPE_COLORS, LOG_TYPE_COLORS } from '../../../../shared/constants/colors';
import { colorOfType, defaultTypeColorsOf, severityRankOf, typeColorsOf } from './log-severity';

describe('severityRankOf', () => {
  it('severityRankOf, for the names a severity goes by, ranks the most severe first whatever the case', () => {
    expect(['PANIC', 'Err', 'warning', 'notice', 'trace'].map(severityRankOf)).toEqual([0, 1, 2, 3, 4]);
  });

  it('severityRankOf, for a type that is no severity, ranks it after all of them', () => {
    expect(severityRankOf('audit')).toBe(5);
    expect(severityRankOf('unknown')).toBe(5);
  });
});

describe('defaultTypeColorsOf', () => {
  it('defaultTypeColorsOf, for severities and the missing type, gives each its own colour', () => {
    const colors = defaultTypeColorsOf(['fatal', 'ERROR', 'warn', 'info', 'debug', 'unknown']);

    expect([...colors.values()]).toEqual([
      LOG_TYPE_COLORS.fatal,
      LOG_TYPE_COLORS.error,
      LOG_TYPE_COLORS.warning,
      LOG_TYPE_COLORS.info,
      LOG_TYPE_COLORS.debug,
      LOG_TYPE_COLORS.unknown,
    ]);
  });

  it('defaultTypeColorsOf, for other types, hands out the extra colours in order and starts over when they run out', () => {
    const types = ['audit', 'info', 'billing', 'c', 'd', 'e', 'f', 'g'];
    const colors = defaultTypeColorsOf(types);

    expect(colors.get('audit')).toBe(LOG_EXTRA_TYPE_COLORS[0]);
    expect(colors.get('billing')).toBe(LOG_EXTRA_TYPE_COLORS[1]);
    expect(colors.get('g')).toBe(LOG_EXTRA_TYPE_COLORS[0]);
  });
});

describe('typeColorsOf', () => {
  it('typeColorsOf, for a type someone recoloured, keeps the chosen colour over the default', () => {
    const colors = typeColorsOf(['error', 'info'], new Map([['error', '#123456']]));

    expect(colorOfType(colors, 'error')).toBe('#123456');
    expect(colorOfType(colors, 'info')).toBe(LOG_TYPE_COLORS.info);
    expect(colorOfType(colors, 'never seen')).toBe(LOG_TYPE_COLORS.unknown);
  });
});
