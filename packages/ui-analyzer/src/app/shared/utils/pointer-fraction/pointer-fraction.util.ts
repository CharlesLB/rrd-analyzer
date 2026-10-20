const PRIMARY_BUTTON = 0;

const fractionWithin = (length: number, offset: number): number => (length === 0 ? 0 : Math.max(0, Math.min(1, offset / length)));

export const horizontalFractionIn = (element: HTMLElement, event: MouseEvent): number => {
  const bounds = element.getBoundingClientRect();

  return fractionWithin(bounds.width, event.clientX - bounds.left);
};

export const horizontalFractionOf = (event: MouseEvent): number => horizontalFractionIn(event.currentTarget as HTMLElement, event);

export const verticalFractionOf = (event: MouseEvent): number => {
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();

  return fractionWithin(bounds.height, event.clientY - bounds.top);
};

export const capturePointerOn = (element: HTMLElement, event: PointerEvent): void => element.setPointerCapture(event.pointerId);

export const capturePointer = (event: PointerEvent): void => capturePointerOn(event.currentTarget as HTMLElement, event);

export const isPrimaryPress = (event: PointerEvent): boolean => event.button === PRIMARY_BUTTON;
