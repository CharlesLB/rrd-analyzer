import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const SMALL_LIMITS_FOR_TESTS = {
  MAXIMUM_CHUNK_BYTES: 64,
  MAXIMUM_STATE_BYTES: 48,
  MAXIMUM_SESSION_BYTES: 160,
  MAXIMUM_SESSION_FILES: 3,
  INACTIVITY_MILLISECONDS: 3_600_000,
  ALLOWED_ORIGINS: 'http://127.0.0.1:4210, http://localhost:4210',
};

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' }, miniflare: { bindings: SMALL_LIMITS_FOR_TESTS } })],
  test: {
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.d.ts', 'src/testing/**'],
      reporter: [['text', { skipFull: true }], 'text-summary'],
      thresholds: { 100: true },
    },
  },
});
