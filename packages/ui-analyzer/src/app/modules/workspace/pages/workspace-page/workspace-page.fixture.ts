import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { expect, vi } from 'vitest';
import { WorkspaceStore } from '../../../../stores/workspace/store/workspace-store/workspace.store';
import { WorkspacePageComponent } from './workspace-page.component';

export type WorkspacePageFixture = ComponentFixture<WorkspacePageComponent>;

export const renderWorkspacePage = async (): Promise<WorkspacePageFixture> => {
  const fixture = TestBed.createComponent(WorkspacePageComponent);
  fixture.componentRef.setInput('analysisId', 'a1');
  fixture.detectChanges();
  await vi.waitFor(() => expect(TestBed.inject(WorkspaceStore).analysisName()).not.toBe(''));
  await fixture.whenStable();
  fixture.detectChanges();

  return fixture;
};
