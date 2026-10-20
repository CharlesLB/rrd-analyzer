import { Service } from '@angular/core';
import * as R from 'remeda';
import type { AnalysisDto, CanvasChartDto, PickedFileDto } from '../../../../core/gateway/analyzer.dto';
import { isDesktopRuntime } from '../../../../core/gateway/desktop-runtime/desktop-runtime';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import type { Analysis, ChartLabels, PendingSource } from '../../models/analysis/analysis.model';
import type { FileDropHandler } from './library.types';

const toChartLabels = (chart: CanvasChartDto): ChartLabels => [chart.label, ...R.map(chart.merged, (merged) => merged.label)];

const toAnalysis = (dto: AnalysisDto): Analysis => ({
  ...R.pick(dto, ['id', 'name', 'lastAccessedMilliseconds']),
  canvas: R.map(dto.canvas, toChartLabels),
});

const toPickedFile = (source: PendingSource): PickedFileDto => R.pick(source, ['name', 'path', 'size']);

const toPendingSource = (dto: PickedFileDto): PendingSource => R.pick(dto, ['name', 'path', 'size']);

@Service()
export class LibraryRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public readonly usesNativeFileDrop = isDesktopRuntime();

  public async listAnalyses(): Promise<readonly Analysis[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.listAnalyses()), toAnalysis);
  }

  public async createAnalysis(name: string, sources: readonly PendingSource[]): Promise<Analysis> {
    return toAnalysis(await this._withGateway(async (gateway) => await gateway.createAnalysis(name, R.map(sources, toPickedFile))));
  }

  public async missingSourceNames(analysisId: string): Promise<readonly string[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.missingSources(analysisId)), (source) => source.name);
  }

  public async deleteAnalysis(analysisId: string): Promise<void> {
    await this._withGateway(async (gateway) => await gateway.deleteAnalysis(analysisId));
  }

  public async pickSources(): Promise<readonly PendingSource[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.pickSources()), toPendingSource);
  }

  public async describeSources(paths: readonly string[]): Promise<readonly PendingSource[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.describeSources(paths)), toPendingSource);
  }

  public async describeFiles(files: readonly File[]): Promise<readonly PendingSource[]> {
    return R.map(await this._withGateway(async (gateway) => await gateway.describeFiles(files)), toPendingSource);
  }

  public watchFileDrop(handler: FileDropHandler): () => void {
    const watching = this._withGateway((gateway) => gateway.watchFileDrop(handler));

    return () =>
      void watching.then(
        (stopWatching) => stopWatching(),
        () => undefined,
      );
  }
}
