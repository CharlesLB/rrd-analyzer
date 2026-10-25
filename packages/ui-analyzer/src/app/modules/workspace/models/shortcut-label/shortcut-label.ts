type ShortcutCombination = {
  readonly key: string;
  readonly withCommand?: boolean;
  readonly withShift?: boolean;
};

type PlatformDescription = {
  readonly platform?: string;
  readonly userAgent?: string;
};

const APPLE_PLATFORM = /mac|iphone|ipad|ipod/i;

const APPLE_KEYS = { command: '⌘', shift: '⇧', joiner: '' } as const;
const OTHER_KEYS = { command: 'Ctrl', shift: 'Shift', joiner: '+' } as const;

export const SHORTCUT_COMBINATIONS = {
  FIND: { key: 'F', withCommand: true },
  PREVIOUS_MATCH: { key: 'Enter', withShift: true },
} as const satisfies Readonly<Record<string, ShortcutCombination>>;

export const usesAppleKeys = (described: PlatformDescription | undefined): boolean =>
  APPLE_PLATFORM.test(described?.platform ?? '') || APPLE_PLATFORM.test(described?.userAgent ?? '');

export const shortcutLabelOf = (combination: ShortcutCombination, isApple: boolean): string => {
  const keys = isApple ? APPLE_KEYS : OTHER_KEYS;
  const modifiers = [combination.withCommand === true ? keys.command : null, combination.withShift === true ? keys.shift : null];

  return [...modifiers.filter((modifier) => modifier !== null), combination.key].join(keys.joiner);
};
