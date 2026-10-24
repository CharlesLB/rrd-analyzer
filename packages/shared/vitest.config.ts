import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: [['text', { skipFull: true }], 'text-summary'],
      thresholds: { 100: true },
    },
  },
});
