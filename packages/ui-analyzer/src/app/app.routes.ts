import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: async () => (await import('./modules/library/library.routes')).libraryRoutes,
  },
  {
    path: 'shared',
    loadChildren: async () => (await import('./modules/shared-session/shared-session.routes')).sharedSessionRoutes,
  },
  {
    path: 'workspace',
    loadChildren: async () => (await import('./modules/workspace/workspace.routes')).workspaceRoutes,
  },
  { path: '**', redirectTo: '' },
];
