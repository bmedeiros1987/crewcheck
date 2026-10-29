// Read-only smoke check of a CrewCheck origin after a cutover: GET requests only, no login, no
// mutation, no secret. It tells the restored app apart from the platform's suspension page and
// from the maintenance entry (ops/maintenance). A passing /api/health alone proves little (it
// answers ok without configuration), so the shell, worker and manifest are checked too.
//
//   node scripts/ops/post-cutover-smoke.mjs https://crewcheck.online
//   node scripts/ops/post-cutover-smoke.mjs https://crewcheck.online --expect-maintenance
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 20_000;

async function get(base, route, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(route, base), { redirect: 'manual', cache: 'no-store', signal: controller.signal });
    return { status: response.status, type: response.headers.get('content-type') || '', routing: response.headers.get('x-render-routing') || '', cache: response.headers.get('cache-control') || '', text: await response.text() };
  } finally { clearTimeout(timer); }
}

export async function smoke(base, { expectMaintenance = false, fetchImpl = fetch } = {}) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
  const health = await get(base, '/api/health', fetchImpl);
  check('not suspended by the platform', health.routing !== 'suspend' && !/Service Suspended/i.test(health.text), health.routing || health.status);
  if (expectMaintenance) {
    let body = null; try { body = JSON.parse(health.text); } catch {}
    check('/api/health is an honest 503 maintenance answer', health.status === 503 && body?.maintenance === true, health.status);
    const root = await get(base, '/', fetchImpl);
    check('/ shows the maintenance notice', root.status === 503 && root.text.includes('Sistema em manutenção. Estamos trabalhando para restabelecer o acesso.'), root.status);
    check('maintenance is never cached', /no-store/.test(root.cache) && /no-store/.test(health.cache), root.cache);
  } else {
    let body = null; try { body = JSON.parse(health.text); } catch {}
    check('/api/health 200 JSON ok', health.status === 200 && body?.ok === true && body?.app === 'CrewCheck', health.status);
    const root = await get(base, '/', fetchImpl);
    check('/ serves the app shell', root.status === 200 && /text\/html/.test(root.type) && /<div id="root"/.test(root.text) && !/Sistema em manutenção/.test(root.text), root.status);
    const worker = await get(base, '/sw.js', fetchImpl);
    check('/sw.js is the service worker script', worker.status === 200 && /javascript/.test(worker.type), `${worker.status} ${worker.type}`);
    const manifest = await get(base, '/manifest.json', fetchImpl);
    check('/manifest.json is JSON', manifest.status === 200 && /json/.test(manifest.type), `${manifest.status} ${manifest.type}`);
  }
  return { ok: results.every(r => r.ok), results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const base = process.argv[2];
  if (!/^https?:\/\//.test(base || '')) { console.error('Usage: post-cutover-smoke.mjs <https://origin> [--expect-maintenance]'); process.exit(2); }
  const report = await smoke(base, { expectMaintenance: process.argv.includes('--expect-maintenance') });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
