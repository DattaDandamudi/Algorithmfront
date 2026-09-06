import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    // The simulation suites (hrv/readiness/impact/expenditure `.sim.test.ts`)
    // run thousands of synthetic days each and take a second or two on an idle
    // machine. Vitest's 5 s default is a hang detector, not a performance
    // budget, and under parallel-worker contention it has aborted a healthy
    // `hrv.sim` run — a red build that says nothing about the code. Performance
    // is asserted where it is meant to be (see the calibrated gate in
    // engine/context.test.ts); this is only the safety net.
    testTimeout: 30_000,
  },
});
