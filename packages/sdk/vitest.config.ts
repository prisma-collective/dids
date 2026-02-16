import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.ts', 'src/tx/metadata.ts', 'src/utils/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/__tests__/**',
        // Require external infra (Lucid, CSL, Blockfrost, IPFS) — not unit-testable
        'src/core/vc-anchor.ts',
        'src/core/ipfs.ts',
        'src/core/cose-verify.ts',    // needs CSL for COSE_Sign1 decode
        'src/core/verification.ts',   // depends on cose-verify (tested via vc-verify mocks)
        'src/utils/address.ts',
        'src/utils/crypto-setup.ts',
        'src/utils/serialization.ts',
        'src/utils/constants.ts',
      ],
      thresholds: {
        statements: 90,
        branches: 70,
        functions: 90,
        lines: 90,
      },
    },
  },
});
