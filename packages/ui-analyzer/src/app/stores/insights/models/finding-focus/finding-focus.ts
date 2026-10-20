export const clampedFocusOf = (focusIndex: number, findingCount: number): number => Math.min(focusIndex, findingCount - 1);

export const movedFocusOf = (focusIndex: number, findingCount: number, offset: number): number =>
  Math.max(0, Math.min(findingCount - 1, clampedFocusOf(focusIndex, findingCount) + offset));
