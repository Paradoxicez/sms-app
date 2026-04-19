import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    passWithNoTests: true,
    fileParallelism: false,
    server: {
      // Better Auth's esm-loader uses `new Function('...import()...')` to
      // escape SWC's CommonJS transform. Vitest's VM executor blocks that
      // pattern unless the module is inlined into the test bundle.
      deps: {
        inline: [/better-auth/, /@better-auth\/.*/],
      },
    },
  },
});
