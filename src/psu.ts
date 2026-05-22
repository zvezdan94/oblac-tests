import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const PSU_SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../psu.py');
const PSU_HOST = process.env.PSU_HOST ?? '192.168.0.123';
const PSU_PORT = process.env.PSU_PORT ?? '5025';

async function run(cmd: 'on' | 'off'): Promise<void> {
  const t0 = Date.now();
  process.stdout.write(`[psu] ${cmd}\n`);
  try {
    await execFileAsync('python3', [PSU_SCRIPT, '--host', PSU_HOST, '--port', PSU_PORT, cmd]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PSU ${cmd} failed: ${msg}`);
  }
  process.stdout.write(`[psu] ${cmd} ok (${Date.now() - t0} ms)\n`);
}

export const psu = {
  on: () => run('on'),
  off: () => run('off'),
};
