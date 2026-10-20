const POPOVER_GAP = 6;
const MINIMUM_EDGE_DISTANCE = 10;

export type PopoverAnchor = {
  readonly top: number;
  readonly bottom: number;
  readonly right: number;
};

export type LeftEdgeAnchor = {
  readonly left: number;
  readonly bottom: number;
};

export type PopoverPlacement = {
  readonly top: number | null;
  readonly bottom: number | null;
  readonly right: number;
};

export type PopoverSize = {
  readonly width: number;
  readonly heightAllowance: number;
};

export type Viewport = {
  readonly width: number;
  readonly height: number;
};

export const currentViewport = (): Viewport => ({ width: globalThis.innerWidth, height: globalThis.innerHeight });

export const popoverAnchorOf = (element: Element): PopoverAnchor => {
  const { top, bottom, right } = element.getBoundingClientRect();

  return { top, bottom, right };
};

export const leftEdgeAnchorOf = (element: Element): LeftEdgeAnchor => {
  const { left, bottom } = element.getBoundingClientRect();

  return { left, bottom };
};

export const offsetRightOf = (element: HTMLElement): number => {
  const container = element.offsetParent;
  const containerLeft = container === null ? 0 : container.getBoundingClientRect().left;

  return element.getBoundingClientRect().right - containerLeft;
};

const opensUpward = (anchor: PopoverAnchor, viewportHeight: number, heightAllowance: number): boolean => {
  const roomBelow = viewportHeight - anchor.bottom - POPOVER_GAP - MINIMUM_EDGE_DISTANCE;
  const roomAbove = anchor.top - POPOVER_GAP - MINIMUM_EDGE_DISTANCE;

  return roomBelow < heightAllowance && roomAbove > roomBelow;
};

const rightInside = (viewport: Viewport, width: number, preferredRight: number): number =>
  Math.max(MINIMUM_EDGE_DISTANCE, Math.round(Math.min(viewport.width - width - MINIMUM_EDGE_DISTANCE, preferredRight)));

export const placeUnderAnchor = (anchor: PopoverAnchor, viewport: Viewport, size: PopoverSize): PopoverPlacement => {
  const right = rightInside(viewport, size.width, viewport.width - anchor.right);

  return opensUpward(anchor, viewport.height, size.heightAllowance)
    ? { top: null, bottom: Math.round(viewport.height - anchor.top + POPOVER_GAP), right }
    : { top: Math.round(anchor.bottom + POPOVER_GAP), bottom: null, right };
};

export const placeUnderLeftEdge = (anchor: LeftEdgeAnchor, viewport: Viewport, width: number): PopoverPlacement => ({
  top: Math.round(anchor.bottom + POPOVER_GAP),
  bottom: null,
  right: rightInside(viewport, width, viewport.width - anchor.left - width),
});
