import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/worker/**/*.ts', 'src/sources/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/worker/poller.ts',     // requires live DB + Blockfrost
        'src/worker/types.ts',      // interfaces only, no executable code
        'src/sources/types.ts',     // interfaces only
      ],
      // Tighten further after Batch 2 (lifecycle E2E adds processor.ts coverage)
      thresholds: {
        statements: 40,
        branches: 35,
        functions: 55,
        lines: 40,
      },
    },
  },
});
