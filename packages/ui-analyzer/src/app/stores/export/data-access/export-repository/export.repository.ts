import { Service } from '@angular/core';
import * as R from 'remeda';
import type { CsvExportDto, SourcesExportDto } from '../../../../core/gateway/analyzer.dto';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import { wholeMillisecondsOf } from '../../../../core/gateway/whole-milliseconds/whole-milliseconds';
import type { CsvExportOutcome, CsvExportQuery, SourcesExportOutcome } from './export.types';

const CANCELLED_SAVE = '';

const isSavedAt = (path: string): boolean => path !== CANCELLED_SAVE;

const toCsvExportOutcome = (dto: CsvExportDto): CsvExportOutcome => ({
  ...R.pick(dto, ['sampleCount', 'seriesCount']),
  isCancelled: dto.path !== undefined && !isSavedAt(dto.path),
});

const toSourcesExportOutcome = (dto: SourcesExportDto): SourcesExportOutcome => ({ isSaved: isSavedAt(dto.path), fileCount: dto.fileCount });

@Service()
export class ExportRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async exportCsv(query: CsvExportQuery): Promise<CsvExportOutcome> {
    return toCsvExportOutcome(await this._withGateway(async (gateway) => await gateway.exportCsv(wholeMillisecondsOf(query))));
  }

  public async exportImage(fileName: string, image: Blob): Promise<boolean> {
    return isSavedAt(await this._withGateway(async (gateway) => await gateway.exportImage(fileName, image)));
  }

  public async exportSources(analysisId: string): Promise<SourcesExportOutcome> {
    return toSourcesExportOutcome(await this._withGateway(async (gateway) => await gateway.exportSources(analysisId)));
  }
}
