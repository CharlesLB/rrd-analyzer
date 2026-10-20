import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: async () => (await import('./modules/home/home.routes')).homeRoutes,
  },
  { path: '**', redirectTo: '' },
];
