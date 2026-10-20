import { describe, expect, it } from 'vitest';
import { formatMessage } from './message-format';

describe('formatMessage', () => {
  it('replaces every named placeholder with the value given for it', () => {
    expect(formatMessage('{count} of {total} series', { count: 3, total: 12 })).toBe('3 of 12 series');
  });

  it('leaves a placeholder untouched when no value carries its name', () => {
    expect(formatMessage('{count} series', {})).toBe('{count} series');
  });

  it('returns a template without placeholders unchanged', () => {
    expect(formatMessage('Create analysis')).toBe('Create analysis');
  });
});
