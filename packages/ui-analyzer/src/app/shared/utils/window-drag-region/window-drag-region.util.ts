const WINDOW_DRAG_REGION = {
  PROPERTY: '--wails-draggable',
  VALUE: 'drag',
} as const;

export const isWindowDragRegion = (target: EventTarget | null): boolean =>
  target instanceof Element && getComputedStyle(target).getPropertyValue(WINDOW_DRAG_REGION.PROPERTY).trim() === WINDOW_DRAG_REGION.VALUE;
