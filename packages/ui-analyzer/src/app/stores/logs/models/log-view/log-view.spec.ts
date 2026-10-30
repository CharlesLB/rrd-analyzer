import { describe, expect, it } from 'vitest';
import { type LogView, readLogView, writtenLogView } from './log-view';

const PLACED_VIEW: LogView = {
  mapping: { timestamp: 'time', type: 'level', message: 'msg' },
  chosenColors: new Map([['error', '#cc3344']]),
  hiddenTypes: new Set(['debug']),
  isShown: true,
};

describe('log view', () => {
  it('writtenLogView, given a placed view, writes it as plain json values that read back to the same view', () => {
    const written = writtenLogView(PLACED_VIEW);

    const read = readLogView(JSON.parse(JSON.stringify(written)));

    expect(written).toEqual({
      mapping: { timestamp: 'time', type: 'level', message: 'msg' },
      chosenColors: [['error', '#cc3344']],
      hiddenTypes: ['debug'],
      isShown: true,
    });
    expect(read).toEqual(PLACED_VIEW);
  });

  it('readLogView, given a view whose log was never placed, reads it with no mapping', () => {
    const read = readLogView({ mapping: null, chosenColors: [], hiddenTypes: [], isShown: false });

    expect(read).toEqual({ mapping: null, chosenColors: new Map(), hiddenTypes: new Set(), isShown: false });
  });

  it.each([
    { name: 'nothing at all', written: null },
    { name: 'a list instead of a view', written: [] },
    { name: 'a mapping that is not an object', written: { mapping: 'time', chosenColors: [], hiddenTypes: [], isShown: true } },
    { name: 'a mapping missing a role', written: { mapping: { timestamp: 'time', type: 'level' }, chosenColors: [], hiddenTypes: [], isShown: true } },
    {
      name: 'a mapping naming a field by number',
      written: { mapping: { timestamp: 'time', type: 1, message: 'msg' }, chosenColors: [], hiddenTypes: [], isShown: true },
    },
    { name: 'a color that is not #rrggbb', written: { mapping: null, chosenColors: [['error', 'url(https://example.com)']], hiddenTypes: [], isShown: true } },
    { name: 'a color choice that is not a pair', written: { mapping: null, chosenColors: [['error']], hiddenTypes: [], isShown: true } },
    { name: 'a type named by a number', written: { mapping: null, chosenColors: [], hiddenTypes: [7], isShown: true } },
    { name: 'hidden types that are not a list', written: { mapping: null, chosenColors: [], hiddenTypes: 'debug', isShown: true } },
    { name: 'no word on whether the track is shown', written: { mapping: null, chosenColors: [], hiddenTypes: [] } },
  ])('readLogView, given $name, refuses to read a view from it', ({ written }) => {
    expect(readLogView(written)).toBeNull();
  });
});
