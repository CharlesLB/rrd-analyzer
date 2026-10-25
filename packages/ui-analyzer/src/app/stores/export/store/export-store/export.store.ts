import { computed, inject, Service, signal } from '@angular/core';
import { formatMessage, formatPlural } from '@rrd-analyzer/shared';
import { ThemeStore } from '@rrd-analyzer/ui-shared';
import * as R from 'remeda';
import { canCopyImages, copyImage } from '../../../../shared/utils/clipboard-image/clipboard-image.util';
import { PNG_MIME_TYPE } from '../../../../shared/utils/svg-raster/svg-raster.util';
import { I18nStore } from '../../../i18n/store/i18n-store/i18n.store';
import { InsightsStore } from '../../../insights/store/insights-store/insights.store';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { chartIdsOf } from '../../../workspace/models/plotted-chart/plotted-chart';
import { seriesIdsOfLines } from '../../../workspace/models/series/series.model';
import { SeriesDataStore } from '../../../workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../../workspace/store/workspace-store/workspace.store';
import { ExportRepository } from '../../data-access/export-repository/export.repository';
import { EXPORT_EXTENSIONS, type ExportExtension, exportFileNameOf } from '../../models/export-file-name/export-file-name';
import { EXPORT_FRAME } from '../../models/export-layout/export-layout';
import { EXPORT_FORMATS, type ExportFormat, type ExportMenuPlacement } from '../../models/export-menu/export-menu';
import { DARK_EXPORT_PALETTE, LIGHT_EXPORT_PALETTE } from '../../models/export-palette/export-palette';
import { type ExportChartPlan, exportPlansOf, planTitleOf } from '../../models/export-plan/export-plan';
import { ExportRenderer, type ExportRenderRequest } from '../export-renderer/export-renderer';

const SVG_MIME_TYPE = 'image/svg+xml;charset=utf-8';
const SETTLED_FULFILLED = 'fulfilled';
const FRAME_SIZE = { width: EXPORT_FRAME.WIDTH, height: EXPORT_FRAME.HEIGHT };

type ChartExporter = (charts: readonly ExportChartPlan[]) => Promise<boolean>;

type ExportMenuDetails = ExportMenuPlacement & {
  readonly color: string;
  readonly scopeLabel: string;
  readonly chartCount: number;
  readonly seriesCount: number;
};

@Service({ autoProvided: false })
export class ExportStore {
  private readonly _repository = inject(ExportRepository);
  private readonly _renderer = inject(ExportRenderer);
  private readonly _workspace = inject(WorkspaceStore);
  private readonly _seriesData = inject(SeriesDataStore);
  private readonly _timeWindow = inject(TimeWindowStore);
  private readonly _insights = inject(InsightsStore);
  private readonly _theme = inject(ThemeStore);
  private readonly _toasts = inject(ToastStore);
  private readonly _texts = inject(I18nStore).texts;

  private readonly _exporters: Readonly<Record<ExportFormat, ChartExporter>> = {
    [EXPORT_FORMATS.PNG]: async (charts) => await this._exportPng(charts),
    [EXPORT_FORMATS.COPY]: async (charts) => await this._copyPng(charts),
    [EXPORT_FORMATS.SVG]: async (charts) => await this._exportSvg(charts),
    [EXPORT_FORMATS.CSV]: async (charts) => await this._exportCsv(charts),
  };

  private readonly _menuState = signal<ExportMenuPlacement | null>(null);

  public readonly menu = this._menuState.asReadonly();
  public readonly menuChartId = computed(() => this._menuState()?.chartId ?? null);

  public readonly menuDetails = computed<ExportMenuDetails | null>(() => {
    const placement = this._menuState();
    const [plan] = placement === null ? [] : exportPlansOf(this._workspace.canvas(), this._workspace.seriesById(), [placement.chartId]);
    const lead = R.first(plan?.lines ?? []);

    if (placement === null || plan === undefined || lead === undefined) {
      return null;
    }

    const messages = this._texts().export;

    return {
      ...placement,
      color: lead.series.color,
      scopeLabel: formatMessage(this._insights.overlaidFindings().length > 0 ? messages.scopeWithFindings : messages.scope, {
        name: this._titleOf(plan),
        duration: this._timeWindow.durationLabel(),
      }),
      chartCount: this._workspace.canvas().length,
      seriesCount: plan.lines.length,
    };
  });

  public toggleMenu(placement: ExportMenuPlacement): void {
    this._menuState.update((current) => (current?.chartId === placement.chartId ? null : placement));
  }

  public closeMenu(): void {
    this._menuState.set(null);
  }

  public async exportChart(format: ExportFormat): Promise<boolean> {
    const placement = this._menuState();

    if (placement === null) {
      return false;
    }

    this.closeMenu();

    return await this._exportCharts([placement.chartId], this._exporters[format]);
  }

  public async exportAllCharts(): Promise<boolean> {
    this.closeMenu();

    return await this._exportCharts(chartIdsOf(this._workspace.canvas()), this._exporters[EXPORT_FORMATS.PNG]);
  }

  public async exportSources(): Promise<boolean> {
    const messages = this._texts().export;

    try {
      const exported = await this._repository.exportSources(this._workspace.analysisId());

      if (!exported.isSaved) {
        return false;
      }

      this._toasts.show(formatPlural(messages.sourcesExported, exported.fileCount));

      return true;
    } catch {
      this._toasts.showFailure(messages.sourcesFailed);

      return false;
    }
  }

  private _titleOf(plan: ExportChartPlan): string {
    return planTitleOf(plan, this._texts().application.mergedSeparator);
  }

  private async _exportCharts(chartIds: readonly string[], exporter: ChartExporter): Promise<boolean> {
    const charts = exportPlansOf(this._workspace.canvas(), this._workspace.seriesById(), chartIds);

    if (charts.length === 0) {
      this._toasts.show(this._texts().workspace.nothingToExport);

      return false;
    }

    return await exporter(charts);
  }

  private async _exportPng(charts: readonly ExportChartPlan[]): Promise<boolean> {
    const messages = this._texts().export;

    this._toasts.show(messages.rendering);

    const image = await this._renderer.pngOf(this._renderRequestOf(charts)).catch(() => null);

    if (image === null) {
      this._toasts.showFailure(messages.pngFailed);

      return false;
    }

    return await this._save(this._fileNameOf(charts, EXPORT_EXTENSIONS.PNG), image, formatMessage(messages.pngExported, FRAME_SIZE));
  }

  private async _copyPng(charts: readonly ExportChartPlan[]): Promise<boolean> {
    const messages = this._texts().export;

    if (!canCopyImages()) {
      this._toasts.showFailure(messages.clipboardUnavailable);

      return await this._exportPng(charts);
    }

    const rendering = this._renderer.pngOf(this._renderRequestOf(charts));
    const copying = copyImage(rendering, PNG_MIME_TYPE);

    this._toasts.show(messages.rendering);

    const [copied] = await Promise.allSettled([copying, rendering]);
    const wasCopied = copied.status === SETTLED_FULFILLED;

    this._toasts.show(wasCopied ? messages.copied : messages.copyBlocked);

    return wasCopied;
  }

  private async _exportSvg(charts: readonly ExportChartPlan[]): Promise<boolean> {
    const messages = this._texts().export;
    const exported = await this._renderer.documentOf(this._renderRequestOf(charts)).catch(() => null);

    if (exported === null) {
      this._toasts.showFailure(this._texts().workspace.seriesUnavailable);

      return false;
    }

    const summary =
      exported.shadedFindingCount > 0
        ? formatPlural(messages.svgExportedShaded, exported.shadedFindingCount, FRAME_SIZE)
        : formatMessage(messages.svgExported, FRAME_SIZE);

    return await this._save(this._fileNameOf(charts, EXPORT_EXTENSIONS.SVG), new Blob([exported.markup], { type: SVG_MIME_TYPE }), summary);
  }

  private async _exportCsv(charts: readonly ExportChartPlan[]): Promise<boolean> {
    const texts = this._texts();

    try {
      const exported = await this._repository.exportCsv({
        analysisId: this._workspace.analysisId(),
        seriesIds: seriesIdsOfLines(charts),
        ...this._timeWindow.window(),
      });

      if (exported.isCancelled) {
        return false;
      }

      if (exported.sampleCount === 0) {
        this._toasts.show(texts.export.csvEmpty);

        return false;
      }

      this._toasts.show(formatPlural(texts.workspace.csvExported, exported.seriesCount, { samples: exported.sampleCount }));

      return true;
    } catch {
      this._toasts.showFailure(texts.export.saveFailed);

      return false;
    }
  }

  private async _save(fileName: string, file: Blob, savedMessage: string): Promise<boolean> {
    try {
      const isSaved = await this._repository.exportImage(fileName, file);

      if (!isSaved) {
        return false;
      }

      this._toasts.show(savedMessage);

      return true;
    } catch {
      this._toasts.showFailure(this._texts().export.saveFailed);

      return false;
    }
  }

  private _renderRequestOf(charts: readonly ExportChartPlan[]): ExportRenderRequest {
    const texts = this._texts();

    return {
      analysisId: this._workspace.analysisId(),
      readTracks: async (query) => await this._seriesData.fetchTracks(query),
      analysisName: this._workspace.analysisName(),
      charts,
      window: this._timeWindow.window(),
      findings: this._insights.overlaidFindings(),
      palette: this._theme.isDark() ? DARK_EXPORT_PALETTE : LIGHT_EXPORT_PALETTE,
      texts: {
        brand: texts.application.name,
        mergedSeparator: texts.application.mergedSeparator,
        document: texts.export.document,
        severities: texts.insights.severities,
        units: texts.units,
      },
    };
  }

  private _fileNameOf(charts: readonly ExportChartPlan[], extension: ExportExtension): string {
    return exportFileNameOf(
      R.map(charts, (chart) => this._titleOf(chart)),
      this._timeWindow.window(),
      extension,
    );
  }
}
