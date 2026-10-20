import { describe, expect, it } from 'vitest';
import { rememberedIn } from './recent-record.util';

describe('rememberedIn', () => {
  it('rememberedIn keeps as many entries as its capacity, the ones written last, the one just rewritten counting as the latest', () => {
    const four = ['k0', 'k1', 'k2', 'k3'].reduce((record, key) => rememberedIn(record, key, key, 3), {});
    const rewritten = rememberedIn(rememberedIn({ k0: 'k0', k1: 'k1' }, 'k0', 'again', 3), 'k2', 'k2', 3);

    expect(Object.keys(four)).toEqual(['k1', 'k2', 'k3']);
    expect(Object.entries(rewritten)).toEqual([
      ['k1', 'k1'],
      ['k0', 'again'],
      ['k2', 'k2'],
    ]);
  });
});
