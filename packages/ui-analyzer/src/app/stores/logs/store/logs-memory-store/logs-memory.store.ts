import { Service, signal } from '@angular/core';
import * as R from 'remeda';
import { type RecentRecord, rememberedIn } from '../../../../shared/utils/recent-record/recent-record.util';
import type { LogsSnapshot } from '../../models/logs-snapshot/logs-snapshot';

export const REMEMBERED_ANALYSES = 3;

@Service()
export class LogsMemoryStore {
  private readonly _snapshotsState = signal<RecentRecord<LogsSnapshot>>({});

  public snapshotOf(analysisId: string): LogsSnapshot | null {
    return this._snapshotsState()[analysisId] ?? null;
  }

  public remember(analysisId: string, snapshot: LogsSnapshot): void {
    this._snapshotsState.update((snapshots) => rememberedIn(snapshots, analysisId, snapshot, REMEMBERED_ANALYSES));
  }

  public forget(analysisId: string): void {
    this._snapshotsState.update((snapshots) => R.omit(snapshots, [analysisId]));
  }
}
