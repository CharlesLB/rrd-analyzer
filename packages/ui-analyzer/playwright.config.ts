import { defineConfig, devices } from '@playwright/test';
import * as R from 'remeda';
import { daemonPortOf } from './e2e/support/daemon';
import { SHARE_SERVICE_PORT, SHARE_SERVICE_URL } from './e2e/support/share-service';

const WEB_PORT = 4200;
const WORKER_COUNT = 6;
const TEMPORARY_DIRECTORY = process.env['TMPDIR'] ?? '/tmp';
const SHARE_SERVICE_DIRECTORY = `${TEMPORARY_DIRECTORY}/rrd-analyzer-e2e-share-service`;

const shareServiceServer = {
  command: [
    `rm -rf ${SHARE_SERVICE_DIRECTORY}`,
    `mkdir -p ${SHARE_SERVICE_DIRECTORY}/assets`,
    'cd ../share-service',
    `pnpm exec wrangler dev --ip 127.0.0.1 --port ${SHARE_SERVICE_PORT} --assets ${SHARE_SERVICE_DIRECTORY}/assets --persist-to ${SHARE_SERVICE_DIRECTORY}/state --show-interactive-dev-session=false`,
  ].join(' && '),
  port: SHARE_SERVICE_PORT,
  reuseExistingServer: false,
  timeout: 120_000,
};

const daemonServerOf = (workerParallelIndex: number) => ({
  command: `cd ../daemon && go run ./cmd/rrd-analyzer-dev -address 127.0.0.1:${daemonPortOf(workerParallelIndex)} -store ${TEMPORARY_DIRECTORY}/rrd-analyzer-e2e-${workerParallelIndex}.db -share-service ${SHARE_SERVICE_URL}`,
  url: `http://127.0.0.1:${daemonPortOf(workerParallelIndex)}/api/analyses`,
  reuseExistingServer: false,
  timeout: 120_000,
});

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  workers: WORKER_COUNT,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'America/Sao_Paulo',
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--force-device-scale-factor=1'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    shareServiceServer,
    ...R.range(0, WORKER_COUNT).map(daemonServerOf),
    {
      command: `pnpm ng serve --port ${WEB_PORT} --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
