import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveAfter } from 'motion-master-client';
import { expect, test } from 'vitest';
import { api, psu } from '../src/setup.js';
import { circuloJdTestDevice } from '../src/test-devices.js';

const device = circuloJdTestDevice;
const CYCLE_COUNT = Number(process.env.POWER_CYCLE_COUNT ?? 1000);
const STATS_FILE = resolve('circulo-jd-power-cycle-stats.json');
const RESULTS_FILE = resolve('circulo-jd-power-cycle-results.ndjson');
const ENUM_TIMEOUT_MS = 30_000;
const OFF_SETTLE_MS = 2_000;

// CiA 402 statusword bit 3: FAULT
const FAULT_BIT = 1 << 3;

interface CycleResult {
  iteration: number;
  timestamp: string;
  success: boolean;
  faultDetected: boolean;
  error203f: string | null;
  error603f: string | null;
  encoder2111s4: string | null;
  encoder2113s4: string | null;
  hardwareDescription: string | null;
  error: string | null;
  durationMs: number;
}

interface Stats {
  total: number;
  completed: number;
  successes: number;
  failures: number;
  faultCount: number;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  avgDurationMs: number | null;
  startedAt: string;
  updatedAt: string;
}

async function waitForDevice(serialNumber: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { data } = await api.devices.getDevices({ 'request-timeout': 2_000 });
      const found = (
        data as Array<{ hardwareDescription?: { device?: { serialNumber?: string } } }>
      ).some((d) => d.hardwareDescription?.device?.serialNumber === serialNumber);
      if (found) {
        return;
      }
    } catch {}
    await resolveAfter(1_000);
  }
  throw new Error(`Device ${serialNumber} not enumerated within ${timeoutMs}ms`);
}

test(
  `${device.name}: power-cycle stress test`,
  async () => {
    const startedAt = new Date().toISOString();
    const stats: Stats = {
      total: CYCLE_COUNT,
      completed: 0,
      successes: 0,
      failures: 0,
      faultCount: 0,
      minDurationMs: null,
      maxDurationMs: null,
      avgDurationMs: null,
      startedAt,
      updatedAt: startedAt,
    };
    let totalDurationMs = 0;

    writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    writeFileSync(RESULTS_FILE, '');

    try {
      await psu.off();
    } catch (e) {
      console.log(`initial psu.off() failed (continuing): ${e instanceof Error ? e.message : e}`);
    }
    await resolveAfter(OFF_SETTLE_MS);

    for (let i = 1; i <= CYCLE_COUNT; i++) {
      const t0 = Date.now();
      const result: CycleResult = {
        iteration: i,
        timestamp: new Date().toISOString(),
        success: false,
        faultDetected: false,
        error203f: null,
        error603f: null,
        encoder2111s4: null,
        encoder2113s4: null,
        hardwareDescription: null,
        error: null,
        durationMs: 0,
      };

      try {
        await psu.on();
        await waitForDevice(device.serialNumber, ENUM_TIMEOUT_MS);

        const { data: hwDesc } = await api.devices.getDeviceFile(
          device.serialNumber,
          '.hardware_description',
          {},
          { format: 'text' },
        );
        result.hardwareDescription = (hwDesc as unknown as string).trim();

        const { data: swData } = await api.devices.getDeviceParameterValues(device.serialNumber, [
          { index: 0x6041, subindex: 0 },
        ]);
        const sw = swData.parameterValues?.[0]?.uintValue ?? 0;

        if (sw & FAULT_BIT) {
          result.faultDetected = true;
          stats.faultCount++;

          const { data: errCodeData } = await api.devices.getDeviceParameterValues(device.serialNumber, [
            { index: 0x603f, subindex: 0 },
          ]);
          const errCode = errCodeData.parameterValues?.[0]?.uintValue;
          if (errCode !== undefined) {
            result.error603f = `0x${errCode.toString(16).padStart(4, '0')}`;
          }

          const { data: errReportData } = await api.devices.getDeviceParameterValues(device.serialNumber, [
            { index: 0x203f, subindex: 1 },
          ]);
          result.error203f = errReportData.parameterValues?.[0]?.stringValue ?? null;

          const { data: enc2111 } = await api.devices.uploadParameter(device.serialNumber, '0x2111', '0x04');
          if (enc2111?.value !== undefined) {
            result.encoder2111s4 = `0x${(enc2111.value as number).toString(16).padStart(8, '0')}`;
          }

          const { data: enc2113 } = await api.devices.uploadParameter(device.serialNumber, '0x2113', '0x04');
          if (enc2113?.value !== undefined) {
            result.encoder2113s4 = `0x${(enc2113.value as number).toString(16).padStart(8, '0')}`;
          }
        }

        result.success = true;
        stats.successes++;
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
        stats.failures++;
      }

      result.durationMs = Date.now() - t0;
      totalDurationMs += result.durationMs;
      stats.completed++;
      stats.minDurationMs =
        stats.minDurationMs === null ? result.durationMs : Math.min(stats.minDurationMs, result.durationMs);
      stats.maxDurationMs =
        stats.maxDurationMs === null ? result.durationMs : Math.max(stats.maxDurationMs, result.durationMs);
      stats.avgDurationMs = Math.round(totalDurationMs / stats.completed);
      stats.updatedAt = new Date().toISOString();

      writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
      appendFileSync(RESULTS_FILE, `${JSON.stringify(result)}\n`);

      console.log(
        `[cycle ${i}/${CYCLE_COUNT}] ${result.success ? 'ok' : 'FAIL'}` +
          (result.faultDetected
            ? ` fault 0x603F=${result.error603f} 0x203F=${result.error203f} 0x2111:4=${result.encoder2111s4} 0x2113:4=${result.encoder2113s4}`
            : '') +
          (result.error ? ` error="${result.error}"` : '') +
          ` (${result.durationMs}ms)`,
      );

      try {
        await psu.off();
      } catch (e) {
        console.log(`psu.off() cycle ${i} failed: ${e instanceof Error ? e.message : e}`);
      }
      await resolveAfter(OFF_SETTLE_MS);
    }

    console.log(`\nCompleted ${stats.completed}/${stats.total} cycles`);
    console.log(`  successes=${stats.successes} failures=${stats.failures} faults=${stats.faultCount}`);
    console.log(
      `  duration min=${stats.minDurationMs}ms avg=${stats.avgDurationMs}ms max=${stats.maxDurationMs}ms`,
    );
    console.log(`  stats: ${STATS_FILE}`);
    console.log(`  results: ${RESULTS_FILE}`);

    expect(stats.completed).toBe(CYCLE_COUNT);
  },
  CYCLE_COUNT * 30_000,
);
