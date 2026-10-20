import { describe, expect, it } from 'vitest';
import { defaultTypeColorsOf } from '../../../../stores/logs/models/log-severity/log-severity';
import type { LogEntry } from '../../../../stores/logs/models/log-timeline/log-timeline';
import { logMarksOf, NO_LOG_MARKS } from './log-mark';

const WINDOW = { fromMilliseconds: 1000, untilMilliseconds: 2000 };
const COLORS = defaultTypeColorsOf(['error', 'info']);

const entryAt = (timeMilliseconds: number, type: string): LogEntry => ({ index: 0, timeMilliseconds, type, message: '', record: {} });

describe('logMarksOf', () => {
  it('logMarksOf, for a hovered and a selected entry, marks both in their type colour, the selected one last', () => {
    expect(logMarksOf({ hovered: entryAt(1250, 'info'), selected: entryAt(1500, 'error') }, WINDOW, COLORS)).toEqual([
      { fraction: 0.25, x: 250, color: COLORS.get('info'), isSelected: false },
      { fraction: 0.5, x: 500, color: COLORS.get('error'), isSelected: true },
    ]);
  });

  it('logMarksOf, for an entry outside the window or for no entry at all, marks nothing', () => {
    expect(logMarksOf({ hovered: null, selected: entryAt(2500, 'error') }, WINDOW, COLORS)).toBe(NO_LOG_MARKS);
  });
});
