import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: async () => (await import('./modules/library/library.routes')).libraryRoutes,
  },
  {
    path: 'workspace',
    loadChildren: async () => (await import('./modules/workspace/workspace.routes')).workspaceRoutes,
  },
  { path: '**', redirectTo: '' },
];
