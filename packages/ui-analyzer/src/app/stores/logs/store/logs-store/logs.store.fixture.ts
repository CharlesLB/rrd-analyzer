import { MILLISECONDS_PER_HOUR } from '@rrd-analyzer/shared';
import { FIXTURE_UNTIL_MILLISECONDS } from '../../../../core/gateway/analyzer.gateway.fixture';
import type { LogRecord } from '../../models/log-source/log-source';

type FixtureEntry = readonly [hoursBeforeTheEnd: number, level: string, message: string];

const FIXTURE_ENTRIES: readonly FixtureEntry[] = [
  [20, 'info', 'Config reloaded'],
  [16, 'warn', 'Heap usage at 84% of limit'],
  [12, 'error', 'Allocation failed'],
  [11, 'fatal', 'OOMKilled: process exceeded memory limit'],
  [6, 'info', 'Process restarted'],
  [2, 'error', 'Upstream 503 from atlas-store'],
];

export const LOG_FIXTURE_COUNT = FIXTURE_ENTRIES.length;

export const logRecordsFixture = (): readonly LogRecord[] =>
  FIXTURE_ENTRIES.map(([hours, level, message], index) => ({
    '@timestamp': new Date(FIXTURE_UNTIL_MILLISECONDS - hours * MILLISECONDS_PER_HOUR).toISOString(),
    lvl: level,
    service: 'atlas-api',
    event: { msg: message },
    ctx: { trace_id: `trace-${index}` },
  }));

export const logFileFixture = (records: readonly unknown[] = logRecordsFixture(), name = 'atlas-api-logs.json'): File =>
  new File([JSON.stringify(records)], name, { type: 'application/json' });

export const textFileFixture = (content: string, name: string): File => new File([content], name);
