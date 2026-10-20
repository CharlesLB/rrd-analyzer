import { test as base, type Route } from '@playwright/test';
import { APP_DAEMON_URL, daemonAddressed, isOnSharedDaemon } from './daemon';

const answeredByTheWorkerDaemon = async (route: Route): Promise<void> => {
  const answer = await route.fetch({ url: daemonAddressed(route.request().url()) });

  await route.fulfill({ response: answer });
};

const requestOutlivedItsTest = (): void => undefined;

export const test = base.extend({
  context: async ({ context }, use) => {
    if (!isOnSharedDaemon) {
      await context.route(`${APP_DAEMON_URL}/**`, async (route) => {
        await answeredByTheWorkerDaemon(route).catch(requestOutlivedItsTest);
      });
    }

    await use(context);
  },
});
