import { defineConfig, devices } from '@playwright/test';

const LANDING_PORT = 4300;
const SITE_PORT = 4301;
const SITE_RELEASE_VERSION = '0.0.0';

const browserUse = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    contextOptions: { reducedMotion: 'reduce' },
    launchOptions: { args: ['--force-device-scale-factor=1'] },
  },
  projects: [
    { name: 'landing', testDir: './e2e/home', use: { ...browserUse, baseURL: `http://127.0.0.1:${LANDING_PORT}` } },
    { name: 'site', testDir: './e2e/site', use: { ...browserUse, baseURL: `http://127.0.0.1:${SITE_PORT}` } },
  ],
  webServer: [
    {
      command: `pnpm ng serve --port ${LANDING_PORT} --host 127.0.0.1`,
      url: `http://127.0.0.1:${LANDING_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
    {
      command: `RELEASE_VERSION=${SITE_RELEASE_VERSION} pnpm build && python3 -m http.server ${SITE_PORT} --bind 127.0.0.1 --directory dist/browser`,
      url: `http://127.0.0.1:${SITE_PORT}/app/`,
      reuseExistingServer: !process.env['CI'],
      timeout: 300_000,
    },
  ],
});
