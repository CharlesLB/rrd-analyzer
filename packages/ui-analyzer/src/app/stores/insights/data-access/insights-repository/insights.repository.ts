import { Service } from '@angular/core';
import * as R from 'remeda';
import type { ConfigurationStampDto, EvidenceDto, FindingDto, InsightsReportDto } from '../../../../core/gateway/analyzer.dto';
import { useAnalyzerGateway } from '../../../../core/gateway/use-analyzer-gateway/use-analyzer-gateway';
import { wholeMillisecondsOf } from '../../../../core/gateway/whole-milliseconds/whole-milliseconds';
import { memberOf } from '../../../../shared/utils/constant-member/constant-member.util';
import type { TimeRange } from '../../../workspace/models/timeframe/timeframe';
import {
  EVIDENCE_DIRECTIONS,
  type Evidence,
  type EvidenceDirection,
  type Finding,
  INSIGHT_SCOPES,
  type InsightScope,
  type InsightsReport,
  SEVERITIES,
  type Severity,
} from '../../models/finding/finding.model';

export type InsightsQuery = {
  readonly analysisId: string;
  readonly scope: InsightScope;
  readonly window: TimeRange;
};

const ALL_SERIES: readonly string[] = [];
const STAMP_SEPARATOR = '|';

const configurationStampOf = (stamp: ConfigurationStampDto): string => [stamp.rulesetHash, stamp.classifierHash].join(STAMP_SEPARATOR);

const severityOf = (raw: string): Severity => memberOf(SEVERITIES, raw) ?? SEVERITIES.INFO;

const directionOf = (raw: string): EvidenceDirection => memberOf(EVIDENCE_DIRECTIONS, raw) ?? EVIDENCE_DIRECTIONS.TREND;

const scopeOf = (raw: string): InsightScope => memberOf(INSIGHT_SCOPES, raw) ?? INSIGHT_SCOPES.ALL;

const toEvidence = (dto: EvidenceDto): Evidence => ({
  semantic: dto.semantic,
  seriesId: dto.seriesId,
  source: dto.source,
  direction: directionOf(dto.direction),
  fromMilliseconds: dto.fromMilliseconds,
  untilMilliseconds: dto.untilMilliseconds,
  fromValue: dto.fromValue,
  toValue: dto.toValue,
  unit: dto.unit,
  spark: dto.spark,
});

const toFinding = (dto: FindingDto): Finding => ({
  id: dto.id,
  severity: severityOf(dto.severity),
  isInferred: dto.inferred,
  match: dto.match,
  title: dto.title,
  fromMilliseconds: dto.fromMilliseconds,
  untilMilliseconds: dto.untilMilliseconds,
  cause: R.map(dto.cause, (part) => ({ text: part.text, isEmphasized: part.emphasis })),
  evidence: R.map(dto.evidence, toEvidence),
});

const toReport = (dto: InsightsReportDto): InsightsReport => ({
  configurationStamp: configurationStampOf(dto.analyzed),
  scope: scopeOf(dto.analyzed.scope),
  fromMilliseconds: dto.analyzed.fromMilliseconds,
  untilMilliseconds: dto.analyzed.untilMilliseconds,
  unclassifiedLabels: R.map(dto.analyzed.seriesUnclassified, (reference) => reference.label),
  findings: R.map(dto.findings, toFinding),
});

@Service()
export class InsightsRepository {
  private readonly _withGateway = useAnalyzerGateway();

  public async run(query: InsightsQuery, cancellation: AbortSignal): Promise<InsightsReport> {
    const report = await this._withGateway(
      async (gateway) =>
        await gateway.runInsights(
          {
            analysisId: query.analysisId,
            scope: query.scope,
            ...wholeMillisecondsOf(query.window),
            seriesIds: ALL_SERIES,
          },
          cancellation,
        ),
    );

    return toReport(report);
  }

  public async configurationStamp(): Promise<string> {
    return configurationStampOf(await this._withGateway(async (gateway) => await gateway.fetchInsightsConfiguration()));
  }
}
