import { type LeftEdgeAnchor, type PopoverPlacement, placeUnderLeftEdge, type Viewport } from '../../../../shared/utils/anchored-popover/anchored-popover.util';

export const COLOR_MENU_WIDTH = 248;

export type ColorMenuRequest = LeftEdgeAnchor & {
  readonly seriesId: string;
};

export type ColorMenuPlacement = PopoverPlacement & {
  readonly seriesId: string;
};

export type ColorMenuDetails = ColorMenuPlacement & {
  readonly color: string;
};

export const placeColorMenu = (request: ColorMenuRequest, viewport: Viewport): ColorMenuPlacement => ({
  seriesId: request.seriesId,
  ...placeUnderLeftEdge(request, viewport, COLOR_MENU_WIDTH),
});
