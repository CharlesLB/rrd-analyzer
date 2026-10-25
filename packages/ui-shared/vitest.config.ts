import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.fixture.ts', 'src/test-setup.ts'],
      reporter: [['text', { skipFull: true }], 'text-summary'],
      thresholds: { 100: true },
    },
  },
});
