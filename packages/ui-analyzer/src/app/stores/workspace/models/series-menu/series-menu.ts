import {
  type PopoverAnchor,
  type PopoverPlacement,
  type PopoverSize,
  placeUnderAnchor,
  type Viewport,
} from '../../../../shared/utils/anchored-popover/anchored-popover.util';
import type { AxisChoice } from '../chart-axes/chart-axes';
import type { Series } from '../series/series.model';

export const SERIES_MENU_SIZE: PopoverSize = { width: 330, heightAllowance: 260 };

export type SeriesMenuRequest = PopoverAnchor & {
  readonly chartId: string;
};

export type SeriesMenuPlacement = PopoverPlacement & {
  readonly chartId: string;
};

export type SeriesMenuRow = {
  readonly series: Series;
  readonly axis: number;
  readonly choices: readonly AxisChoice[];
};

export type SeriesMenuDetails = SeriesMenuPlacement & {
  readonly rows: readonly SeriesMenuRow[];
};

export const placeSeriesMenu = (request: SeriesMenuRequest, viewport: Viewport): SeriesMenuPlacement => ({
  chartId: request.chartId,
  ...placeUnderAnchor(request, viewport, SERIES_MENU_SIZE),
});
