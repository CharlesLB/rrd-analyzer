import type { Routes } from '@angular/router';

const PRERENDERED_NOT_FOUND_PATH = 'not-found';
const EVERY_OTHER_PATH = '**';

const loadNotFoundRoutes = async (): Promise<Routes> => (await import('./modules/not-found/not-found.routes')).notFoundRoutes;

export const routes: Routes = [
  {
    path: '',
    loadChildren: async () => (await import('./modules/home/home.routes')).homeRoutes,
  },
  { path: PRERENDERED_NOT_FOUND_PATH, loadChildren: loadNotFoundRoutes },
  { path: EVERY_OTHER_PATH, loadChildren: loadNotFoundRoutes },
];
