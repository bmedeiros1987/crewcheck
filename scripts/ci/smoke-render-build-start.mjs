import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { preparationFingerprint } from '../v139/preparation-cache.mjs';

// npm ci is the preceding CI step. Run the actual package build and start scripts,
// including both apply.mjs invocations, with no inherited credentials and no egress.
const yaml = fs.readFileSync('render.yaml', 'utf8');
assert.match(yaml, /buildCommand: npm ci && npm run build/);
assert.match(yaml, /startCommand: npm start/);
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-start-smoke-'));
const env = {
  PATH: process.env.PATH,
  HOME: home,
  TMPDIR: home,
  NODE_ENV: 'test',
  NODE_DISABLE_COMPILE_CACHE: '1',
  NODE_OPTIONS: `--import=${path.resolve('scripts/ci/smoke-deny-network.mjs')}`,
  CREWCHECK_AUTO_MIGRATE: 'false',
  CREWCHECK_EMERGENCY_ENABLED: 'false',
};
let server;
const launch = args => {
  const child = spawn('npm', args, { env, stdio: 'inherit', detached: process.platform !== 'win32' });
  return child;
};
const stop = child => {
  if (!child || child.exitCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
};
try {
  const build = launch(['run', 'build']);
  const deadline = setTimeout(() => stop(build), 180_000);
  const [code] = await once(build, 'exit'); clearTimeout(deadline);
  assert.equal(code, 0, 'configured npm run build must succeed');
  const prepared = preparationFingerprint();
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  env.PORT = String(probe.address().port); await new Promise(resolve => probe.close(resolve));
  server = launch(['start']);
  let healthy = false;
  for (let i = 0; i < 150 && server.exitCode === null; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    try {
      const response = await fetch(`http://127.0.0.1:${env.PORT}/api/health`, { signal: AbortSignal.timeout(500) });
      const health = await response.json();
      if (response.ok && health.app === 'CrewCheck') { healthy = true; break; }
    } catch {}
  }
  assert.ok(healthy, 'configured npm start must expose local health without credentials');
  assert.equal(preparationFingerprint(), prepared, 'start must not replay or change prepared routing/security sources');
  console.log('PASS: configured npm run build → npm start → localhost health; no credentials, no outbound network, unchanged prepared sources');
} finally {
  stop(server);
  if (server && server.exitCode === null) await once(server, 'exit');
  await fs.promises.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
