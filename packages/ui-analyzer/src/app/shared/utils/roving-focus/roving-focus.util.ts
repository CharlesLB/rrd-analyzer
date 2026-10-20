const NOT_AMONG_THEM = -1;

export const ROVING_KEYS = {
  NEXT: 'ArrowDown',
  PREVIOUS: 'ArrowUp',
  FIRST: 'Home',
  LAST: 'End',
} as const;

export const rovedIndexOf = (key: string, currentIndex: number, count: number): number | null => {
  if (count === 0) {
    return null;
  }

  const lastIndex = count - 1;

  const destinations: Readonly<Record<string, number>> = {
    [ROVING_KEYS.NEXT]: currentIndex === lastIndex ? 0 : currentIndex + 1,
    [ROVING_KEYS.PREVIOUS]: currentIndex <= 0 ? lastIndex : currentIndex - 1,
    [ROVING_KEYS.FIRST]: 0,
    [ROVING_KEYS.LAST]: lastIndex,
  };

  return destinations[key] ?? null;
};

export const roveFocusWithin = (container: HTMLElement, selector: string, event: KeyboardEvent): boolean => {
  const stops = Array.from(container.querySelectorAll<HTMLElement>(selector));
  const focused = container.ownerDocument.activeElement;
  const currentIndex = focused instanceof HTMLElement ? stops.indexOf(focused) : NOT_AMONG_THEM;
  const destination = rovedIndexOf(event.key, currentIndex, stops.length);

  if (destination === null) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  stops[destination]?.focus();

  return true;
};
