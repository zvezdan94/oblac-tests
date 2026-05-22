import { defineConfig } from 'vitest/config';

const optional = new Set(
  (process.env.OPTIONAL_TESTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);
const runAll = optional.has('all');

export default defineConfig({
  test: {
    globals: true,
    // Hardware tests need long timeouts (PSU power-cycle + EtherCAT enumeration + procedures)
    testTimeout: 300_000,
    hookTimeout: 300_000,
    teardownTimeout: 60_000,
    globalSetup: './src/global-setup.ts',
    include: [
      'tests/system.test.ts',
      'tests/circulo-files.test.ts',
      'tests/circulo-config.test.ts',
      'tests/circulo-parameters.test.ts',
      'tests/circulo-offset-detection.test.ts',
      'tests/circulo-system-identification.test.ts',
      'tests/circulo-auto-tuning.test.ts',
      'tests/circulo-encoder.test.ts',
      'tests/circulo-profiles.test.ts',
      'tests/circulo-motion.test.ts',
      'tests/circulo-smm.test.ts',
      'tests/circulo-cia402.test.ts',
      'tests/circulo-friction.test.ts',
      'tests/integro-offset-detection.test.ts',
      // Optional: pass OPTIONAL_TESTS=firmware (or 'all') to include (~5 min: two firmware installs + factory reset)
      ...(runAll || optional.has('firmware') ? ['tests/circulo-firmware.test.ts'] : []),
      // Optional: pass OPTIONAL_TESTS=jonas (or 'all') to include
      ...(runAll || optional.has('jonas') ? ['tests/jonas.test.ts'] : []),
      // Optional: pass OPTIONAL_TESTS=jd (or 'all') to include Circulo JD tests
      ...(runAll || optional.has('jd') ? ['tests/circulo-jd-files.test.ts'] : []),
      // Optional: pass OPTIONAL_TESTS=power-cycle (or 'all') to include; set POWER_CYCLE_COUNT to override 1000 default
      ...(runAll || optional.has('power-cycle') ? ['tests/circulo-jd-power-cycle.test.ts'] : []),
    ],
    // Local: 'verbose' for per-test feedback (the streamed [srv]/[api] logs
    // do redraw the test tree, but we accept that noise locally for the detail).
    // CI: 'basic' (no live redraws — clean linear log) plus 'github-actions' for
    // inline failure annotations on the run summary.
    reporters: process.env.GITHUB_ACTIONS ? ['basic', 'github-actions'] : ['verbose'],
    // Run tests sequentially — multiple devices attached but tests target specific ones
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    env: {
      PSU_URL: process.env.PSU_URL ?? 'http://192.168.212.103',
      MM_API_URL: `http://localhost:${process.env.MM_API_PORT ?? '63526'}/api`,
    },
  },
});
