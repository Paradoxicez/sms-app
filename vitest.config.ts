import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    passWithNoTests: true,
    projects: ['apps/api/vitest.config.ts'],
  },
});
