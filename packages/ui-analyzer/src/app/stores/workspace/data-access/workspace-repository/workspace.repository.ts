import { Service } from '@angular/core';
import * as R from 'remeda';
import type {
  BundleDto,
  CanvasChartDto,
  ChartReferenceDto,
  PickedFileDto,
  PlottedChartDto,
  SeriesDto,
  SeriesStatisticsDto,
} from '../../../../core/gateway/analyzer.dto';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import { wholeMillisecondsOf } from '../../../../core/gateway/whole-milliseconds/whole-milliseconds';
import type { MissingSource } from '../../models/opening-failure/opening-failure';
import { type Canvas, chartIdOf, type PlottedChart } from '../../models/plotted-chart/plotted-chart';
import { type ChartData, type SampleTracks, type Series, type SeriesBundle, type SeriesStatistics, tracksOf } from '../../models/series/series.model';
import { statisticKeysOf } from '../../models/statistic-key/statistic-key';
import type { AddedSources, WindowQuery } from './workspace.types';

const NOTHING_PICKED: AddedSources = { picked: 0, added: 0 };

const toSeries = (dto: SeriesDto): Series => R.pick(dto, ['id', 'file', 'name', 'label', 'unit', 'color', 'stepMilliseconds']);

const toPlottedChart = (dto: PlottedChartDto): PlottedChart => ({
  plotted: R.map(dto.series, (entry) => R.pick(entry, ['seriesId', 'axis'])),
  referenceLines: statisticKeysOf(dto.referenceLines ?? []),
});

const toBundle = (dto: BundleDto): SeriesBundle => ({
  ...R.pick(dto, ['analysisId', 'analysisName', 'fromMilliseconds', 'untilMilliseconds']),
  series: R.map(dto.series, toSeries),
  canvas: R.map(dto.canvas, toPlottedChart),
});

const toMissingSource = (dto: PickedFileDto): MissingSource => R.pick(dto, ['name', 'path']);

const EMPTY_CHART: ChartData = { tracks: {}, statistics: {} };

const toStatistics = (dto: SeriesStatisticsDto): SeriesStatistics | null =>
  dto.hasData ? R.pick(dto.statistics, ['minimum', 'maximum', 'average', 'percentile95', 'last', 'gapCount']) : null;

type LabelOf = (seriesId: string) => string;

const labelIn =
  (seriesById: ReadonlyMap<string, Series>): LabelOf =>
  (seriesId) =>
    seriesById.get(seriesId)?.label ?? seriesId;

const toCanvasChartDto = (chart: PlottedChart, labelOf: LabelOf): CanvasChartDto => {
  const leadSeriesId = chartIdOf(chart);

  return {
    seriesId: leadSeriesId,
    label: labelOf(leadSeriesId),
    merged: R.map(R.drop(chart.plotted, 1), (entry) => ({ seriesId: entry.seriesId, label: labelOf(entry.seriesId), axis: entry.axis })),
    referenceLines: chart.referenceLines,
  };
};

const toChartReferenceDto = (series: Series): ChartReferenceDto => ({ seriesId: series.id, label: series.label });

@Service()
export class WorkspaceRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async openAnalysis(analysisId: string): Promise<SeriesBundle> {
    return toBundle(await this._withGateway(async (gateway) => await gateway.openAnalysis(analysisId)));
  }

  public async missingSources(analysisId: string): Promise<readonly MissingSource[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.missingSources(analysisId)), toMissingSource);
  }

  public async addPickedSources(analysisId: string): Promise<AddedSources> {
    return await this._withGateway(async (gateway) => {
      const picked = await gateway.pickSources();

      return picked.length === 0 ? NOTHING_PICKED : { picked: picked.length, added: (await gateway.addSources(analysisId, picked)).added };
    });
  }

  public async renameAnalysis(analysisId: string, name: string): Promise<string> {
    return (await this._withGateway(async (gateway) => await gateway.renameAnalysis(analysisId, name))).name;
  }

  public async fetchTracks(query: WindowQuery): Promise<SampleTracks> {
    if (query.seriesIds.length === 0) {
      return {};
    }

    return tracksOf(await this._withGateway(async (gateway) => await gateway.fetchSeries(wholeMillisecondsOf(query))));
  }

  public async fetchChart(query: WindowQuery): Promise<ChartData> {
    if (query.seriesIds.length === 0) {
      return EMPTY_CHART;
    }

    const chart = await this._withGateway(async (gateway) => await gateway.fetchChart(wholeMillisecondsOf(query)));

    return {
      tracks: tracksOf(chart.windows),
      statistics: Object.fromEntries(R.map(chart.statistics, (summary) => [summary.seriesId, toStatistics(summary)])),
    };
  }

  public async saveCanvas(analysisId: string, canvas: Canvas, seriesById: ReadonlyMap<string, Series>): Promise<void> {
    const labelOf = labelIn(seriesById);

    await this._withGateway(
      async (gateway) =>
        await gateway.saveCanvas(
          analysisId,
          R.map(canvas, (chart) => toCanvasChartDto(chart, labelOf)),
        ),
    );
  }

  public async saveSeriesColor(analysisId: string, series: Series): Promise<void> {
    await this._withGateway(async (gateway) => await gateway.saveSeriesColor(analysisId, { seriesId: series.id, label: series.label, color: series.color }));
  }

  public async saveLibraryOrder(analysisId: string, library: readonly Series[]): Promise<void> {
    await this._withGateway(async (gateway) => await gateway.saveLibraryOrder(analysisId, R.map(library, toChartReferenceDto)));
  }
}
