import type { ValueOf } from '../../../../shared/types/value-of';
import {
  type PopoverAnchor,
  type PopoverPlacement,
  type PopoverSize,
  placeUnderAnchor,
  type Viewport,
} from '../../../../shared/utils/anchored-popover/anchored-popover.util';

export const EXPORT_MENU_SIZE: PopoverSize = { width: 254, heightAllowance: 290 };

export const EXPORT_FORMATS = {
  PNG: 'png',
  COPY: 'copy',
  SVG: 'svg',
  CSV: 'csv',
} as const;

export type ExportFormat = ValueOf<typeof EXPORT_FORMATS>;

export const EXPORT_MENU_FORMATS: readonly ExportFormat[] = [EXPORT_FORMATS.PNG, EXPORT_FORMATS.COPY, EXPORT_FORMATS.SVG, EXPORT_FORMATS.CSV];

export type ExportMenuRequest = PopoverAnchor & {
  readonly chartId: string;
};

export type ExportMenuPlacement = PopoverPlacement & {
  readonly chartId: string;
};

export const placeExportMenu = (request: ExportMenuRequest, viewport: Viewport): ExportMenuPlacement => ({
  chartId: request.chartId,
  ...placeUnderAnchor(request, viewport, EXPORT_MENU_SIZE),
});
