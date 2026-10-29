import { inject, type Provider } from '@angular/core';
import type { ResolveFn, Routes } from '@angular/router';
import { ExportStore } from '../../stores/export/store/export-store/export.store';
import { I18nStore } from '../../stores/i18n/store/i18n-store/i18n.store';
import { InsightsStore } from '../../stores/insights/store/insights-store/insights.store';
import { LogsStore } from '../../stores/logs/store/logs-store/logs.store';
import { LiveSessionStore } from '../../stores/sharing/store/live-session-store/live-session.store';
import { TimeWindowStore } from '../../stores/time-window/store/time-window-store/time-window.store';
import { CanvasDragStore } from '../../stores/workspace/store/canvas-drag-store/canvas-drag.store';
import { SeriesDataStore } from '../../stores/workspace/store/series-data-store/series-data.store';
import { WorkspaceStore } from '../../stores/workspace/store/workspace-store/workspace.store';
import { WorkspacePageComponent } from './pages/workspace-page/workspace-page.component';

const LIBRARY_ROUTE = '/';

const workspaceTitle: ResolveFn<string> = () => inject(I18nStore).texts().application.workspaceTitle;

export const WORKSPACE_PAGE_PROVIDERS: readonly Provider[] = [
  WorkspaceStore,
  SeriesDataStore,
  CanvasDragStore,
  TimeWindowStore,
  InsightsStore,
  LogsStore,
  ExportStore,
  LiveSessionStore,
];

export const workspaceRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: LIBRARY_ROUTE },
  {
    path: ':analysisId',
    component: WorkspacePageComponent,
    title: workspaceTitle,
    providers: [...WORKSPACE_PAGE_PROVIDERS],
  },
];
