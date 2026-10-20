import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import type { PlottedChartDto } from '../../../../core/gateway/analyzer.dto';
import type { AnalyzerGateway } from '../../../../core/gateway/analyzer.gateway';
import { analyzerGatewayStub, bundleDtoFixture, provideGatewayStub } from '../../../../core/gateway/analyzer.gateway.fixture';
import { TimeWindowStore } from '../../../time-window/store/time-window-store/time-window.store';
import { ToastStore } from '../../../toast/store/toast-store/toast.store';
import { CanvasDragStore } from '../canvas-drag-store/canvas-drag.store';
import { SeriesDataStore } from '../series-data-store/series-data.store';
import { WorkspaceStore } from './workspace.store';

const LIBRARY_SIZE = 7;

export type OpenedWorkspace = {
  readonly gateway: AnalyzerGateway;
  readonly workspace: WorkspaceStore;
  readonly seriesData: SeriesDataStore;
  readonly canvasDrag: CanvasDragStore;
  readonly toasts: ToastStore;
};

export const referenceTo = (index: number) => ({ seriesId: `s${index}`, label: `metric_${index}`, merged: [], referenceLines: [] });

export const openWorkspace = async (canvas: readonly PlottedChartDto[], overrides: Partial<AnalyzerGateway> = {}): Promise<OpenedWorkspace> => {
  const gateway = analyzerGatewayStub({ openAnalysis: vi.fn().mockResolvedValue(bundleDtoFixture(LIBRARY_SIZE, { canvas })), ...overrides });
  TestBed.configureTestingModule({ providers: [provideGatewayStub(gateway), WorkspaceStore, SeriesDataStore, CanvasDragStore, TimeWindowStore] });

  const opened = {
    gateway,
    workspace: TestBed.inject(WorkspaceStore),
    seriesData: TestBed.inject(SeriesDataStore),
    canvasDrag: TestBed.inject(CanvasDragStore),
    toasts: TestBed.inject(ToastStore),
  };

  await opened.workspace.open('a1');

  return opened;
};
