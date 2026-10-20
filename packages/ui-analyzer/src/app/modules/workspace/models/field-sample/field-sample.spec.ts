import { messagesFor } from '@rrd-analyzer/shared';
import { describe, expect, it } from 'vitest';
import { fieldSampleOf } from './field-sample';

const { sampleItems } = messagesFor().logs.setup;

describe('fieldSampleOf', () => {
  it('fieldSampleOf, for a text, quotes it and cuts a long one short', () => {
    expect(fieldSampleOf('Slow request', sampleItems)).toBe('"Slow request"');
    expect(fieldSampleOf('x'.repeat(60), sampleItems)).toBe(`"${'x'.repeat(43)}…"`);
  });

  it('fieldSampleOf, for an array or an object, says what it is instead of printing it', () => {
    expect(fieldSampleOf(['a', 'b'], sampleItems)).toBe('[2 items]');
    expect(fieldSampleOf({ code: 1 }, sampleItems)).toBe('{…}');
  });

  it('fieldSampleOf, for a number, a boolean or null, prints it as it is', () => {
    expect([503, true, null].map((value) => fieldSampleOf(value, sampleItems))).toEqual(['503', 'true', 'null']);
  });
});
