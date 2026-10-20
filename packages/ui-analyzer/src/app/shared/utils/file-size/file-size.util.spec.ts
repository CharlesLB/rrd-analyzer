import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { formatFileSize, WHOLE_KILOBYTES } from './file-size.util';

const { units } = messagesFor();

describe('formatFileSize', () => {
  it('formatFileSize, as a file grows, moves from bytes to kilobytes to megabytes', () => {
    expect(formatFileSize(512, units)).toBe('512 B');
    expect(formatFileSize(275072, units)).toBe('268.6 KB');
    expect(formatFileSize(11387356, units)).toBe('10.9 MB');
  });

  it('formatFileSize asked for whole kilobytes rounds them, and still writes megabytes to a tenth', () => {
    expect(formatFileSize(2048, units, WHOLE_KILOBYTES)).toBe('2 KB');
    expect(formatFileSize(1_048_575, units, WHOLE_KILOBYTES)).toBe('1024 KB');
    expect(formatFileSize(3 * 1_048_576, units, WHOLE_KILOBYTES)).toBe('3.0 MB');
  });
});
