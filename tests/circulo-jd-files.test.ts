import { expect, test } from 'vitest';
import { api } from '../src/setup.js';
import { circuloJdTestDevice } from '../src/test-devices.js';

const device = circuloJdTestDevice;

test(`${device.name}: list files`, async () => {
  const { data } = await api.devices.getDeviceFileList(device.serialNumber);
  expect(Array.isArray(data)).toBe(true);
  expect(data.length).toBeGreaterThan(0);
  console.log(`${device.name} files: ${data.join(', ')}`);
});
