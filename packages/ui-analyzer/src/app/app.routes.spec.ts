import type { LoadChildrenCallback, Route } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { libraryRoutes } from './modules/library/library.routes';
import { sharedSessionRoutes } from './modules/shared-session/shared-session.routes';
import { workspaceRoutes } from './modules/workspace/workspace.routes';

const routeAt = (path: string): Route => {
  const route = routes.find((candidate) => candidate.path === path);

  if (route === undefined) {
    throw new Error(`no route is declared at "${path}"`);
  }

  return route;
};

const childrenLoadedBy = async (path: string): Promise<unknown> => {
  const loadChildren: LoadChildrenCallback | undefined = routeAt(path).loadChildren;

  if (loadChildren === undefined) {
    throw new Error(`the route at "${path}" loads no children`);
  }

  return await loadChildren();
};

describe('routes', () => {
  it('routes, at the root, load the library on demand', async () => {
    expect(await childrenLoadedBy('')).toBe(libraryRoutes);
  });

  it('routes, at the workspace, load the workspace on demand', async () => {
    expect(await childrenLoadedBy('workspace')).toBe(workspaceRoutes);
  });

  it('routes, at a shared link, load the page that opens a live session on demand', async () => {
    expect(await childrenLoadedBy('shared')).toBe(sharedSessionRoutes);
  });

  it('routes send any other address back to the library', () => {
    expect(routeAt('**').redirectTo).toBe('');
  });
});
