import { Service } from '@angular/core';
import * as R from 'remeda';
import { embeddedFontFaceOf } from '../../../../shared/utils/embedded-font/embedded-font.util';
import { rasterizeSvg } from '../../../../shared/utils/svg-raster/svg-raster.util';
import { seriesIdsOfLines } from '../../../workspace/models/series/series.model';
import type { TrackReader } from '../../data-access/export-repository/export.types';
import { type ExportDocument, exportDocumentOf } from '../../models/export-document/export-document';
import type { ExportChartPlan } from '../../models/export-plan/export-plan';
import { EXPORT_COLUMNS, type ExportDocumentRequest } from '../../models/export-request/export-request';

const EXPORT_FONT = { family: 'Nunito', url: '/fonts/nunito-latin.woff2' } as const;
const FONT_STACK_ONLY = '';

export type ExportRenderRequest = Omit<ExportDocumentRequest, 'charts' | 'embeddedFontFace' | 'exportedAtMilliseconds'> & {
  readonly analysisId: string;
  readonly charts: readonly ExportChartPlan[];
  readonly readTracks: TrackReader;
};

@Service()
export class ExportRenderer {
  private readonly _fontFace: { request?: Promise<string> } = {};

  public async documentOf(request: ExportRenderRequest): Promise<ExportDocument> {
    const { analysisId, charts, readTracks, ...document } = request;

    const [tracks, embeddedFontFace] = await Promise.all([
      readTracks({
        analysisId,
        seriesIds: seriesIdsOfLines(charts),
        ...request.window,
        columns: EXPORT_COLUMNS,
      }),
      this._embeddedFontFace(),
    ]);

    return exportDocumentOf({
      ...document,
      charts: R.map(charts, (chart) => ({ lines: R.map(chart.lines, (line) => ({ ...line, samples: tracks[line.series.id] ?? [] })) })),
      exportedAtMilliseconds: Date.now(),
      embeddedFontFace,
    });
  }

  public async pngOf(request: ExportRenderRequest): Promise<Blob> {
    return await rasterizeSvg(await this.documentOf(request));
  }

  private async _embeddedFontFace(): Promise<string> {
    this._fontFace.request ??= embeddedFontFaceOf(EXPORT_FONT);

    try {
      return await this._fontFace.request;
    } catch {
      this._forgetFailedFontRequest();

      return FONT_STACK_ONLY;
    }
  }

  private _forgetFailedFontRequest(): void {
    this._fontFace.request = undefined;
  }
}
