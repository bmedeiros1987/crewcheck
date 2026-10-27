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
  // Exercise the canonical prepared dispatch, not just an import/regex check.
  // No auth header or fake DB configuration: existing identity fails closed with
  // 503 when the DB is unconfigured, or 401 if identity is checked first.
  for (const route of ['/api/operational/escala-contact', '/api/admin/escala-contact']) {
    const response = await fetch(`http://127.0.0.1:${env.PORT}${route}`, { signal: AbortSignal.timeout(1500) });
    assert([401, 503].includes(response.status), route + ' must deny unauthenticated GET, not return 404/HTML');
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const body = await response.json();
    assert.equal(body.ok, false); assert.equal(Object.hasOwn(body, 'contact'), false);
    assert.match(body.message || '', /login|autentica|Banco Aiven|Segredo de autenticação/i);
    // Handler-specific responses distinguish this route from any generic outage.
    const invalid = await fetch(`http://127.0.0.1:${env.PORT}${route}?unexpected=1`, { signal: AbortSignal.timeout(1500) });
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, 'CONTACT_INVALID');
    const method = await fetch(`http://127.0.0.1:${env.PORT}${route}`, { method: 'POST', signal: AbortSignal.timeout(1500) });
    assert.equal(method.status, 405); assert.equal((await method.json()).code, 'CONTACT_METHOD');
    assert.equal(method.headers.get('allow'), route.includes('/admin/') ? 'GET, PUT' : 'GET');
  }
  assert.equal(preparationFingerprint(), prepared, 'start must not replay or change prepared routing/security sources');
  console.log('PASS: configured npm run build → npm start → localhost health + authenticated Escala route denials; no credentials, no outbound network, unchanged prepared sources');
} finally {
  stop(server);
  if (server && server.exitCode === null) await once(server, 'exit');
  await fs.promises.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
