import { describe, expect, it } from 'vitest';
import { SHORTCUT_COMBINATIONS, shortcutLabelOf, usesAppleKeys } from './shortcut-label';

describe('shortcutLabelOf', () => {
  it('writes a combination with the Apple signs on a Mac and with named keys joined by a plus elsewhere', () => {
    expect(shortcutLabelOf(SHORTCUT_COMBINATIONS.FIND, true)).toBe('⌘F');
    expect(shortcutLabelOf(SHORTCUT_COMBINATIONS.FIND, false)).toBe('Ctrl+F');
    expect(shortcutLabelOf(SHORTCUT_COMBINATIONS.PREVIOUS_MATCH, false)).toBe('Shift+Enter');
    expect(shortcutLabelOf(SHORTCUT_COMBINATIONS.PREVIOUS_MATCH, true)).toBe('⇧Enter');
  });
});

describe('usesAppleKeys', () => {
  it('reads the platform, falling back to the user agent, and takes an unknown one for a keyboard with Ctrl', () => {
    expect(usesAppleKeys({ platform: 'MacIntel' })).toBe(true);
    expect(usesAppleKeys({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(true);
    expect(usesAppleKeys({ platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })).toBe(false);
    expect(usesAppleKeys(undefined)).toBe(false);
  });
});
