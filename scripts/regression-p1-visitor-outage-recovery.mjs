import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const applyPath = path.join(repoRoot, 'scripts/p1-visitor-outage-recovery/apply.mjs');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-visitor-outage-'));
fs.mkdirSync(path.join(temp, 'server'), { recursive: true });
fs.mkdirSync(path.join(temp, 'client/src/pages'), { recursive: true });

const serverFixture = `async function handleVisitorData(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
}

async function handleVisitorEmergency(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = await readBody(req, 200_000);
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
}

async function handleVisitorChat(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
}
`;

const clientFixture = `function VisitorAccessPage() {
  const [mode, setMode] = useState<'loading' | 'accept' | 'login' | 'portal'>('loading');
  const [error, setError] = useState('');
  async function loadPortal() {
    try {
      const result = await visitorRequest('/api/platform/visitor/data');
      setData(result);
      const allowed = result?.visitor?.permissions || {};
      setTab(allowed.roster ? 'roster' : allowed.hotels ? 'hotels' : allowed.map ? 'map' : allowed.chat ? 'chat' : 'emergency');
      setMode('portal'); setError(''); return true;
    }
    catch { return false; }
  }
  if (mode === 'loading') return <main className="cv-public"><section className="cv-state"><Loader2 className="cv-spin"/><h1>CrewCheck</h1></section></main>;
}
`;

fs.writeFileSync(path.join(temp, 'server/platform.mjs'), serverFixture);
fs.writeFileSync(path.join(temp, 'client/src/pages/VisitorAccessPage.tsx'), clientFixture);

const oldCwd = process.cwd();
try {
  process.chdir(temp);
  await import(`${pathToFileURL(applyPath).href}?run=${Date.now()}`);
} finally {
  process.chdir(oldCwd);
}

const server = fs.readFileSync(path.join(temp, 'server/platform.mjs'), 'utf8');
const client = fs.readFileSync(path.join(temp, 'client/src/pages/VisitorAccessPage.tsx'), 'utf8');

for (const handler of ['handleVisitorData', 'handleVisitorEmergency', 'handleVisitorChat']) {
  const start = server.indexOf(`async function ${handler}`);
  assert.ok(start >= 0, `${handler} ausente`);
  const snippet = server.slice(start, start + 500);
  assert.ok(snippet.indexOf('const db = await pool();') < snippet.indexOf('const identity = visitorIdentity(req);'), `${handler}: DB deve ser classificado antes da identidade`);
  assert.ok(snippet.indexOf('503') < snippet.indexOf('401'), `${handler}: 503 deve preceder 401 no gate`);
}

assert.match(client, /reason\?\.status === 401\) return false/);
assert.match(client, /setMode\('unavailable'\)/);
assert.match(client, /return true;\n    }\n  }/);
assert.match(client, /mode === 'unavailable'/);
assert.match(client, /Tentar novamente/);
assert.doesNotMatch(client, /catch \{ return false; \}/);

// O patch deve ser idempotente.
const onceServer = server;
const onceClient = client;
try {
  process.chdir(temp);
  await import(`${pathToFileURL(applyPath).href}?run=${Date.now() + 1}`);
} finally {
  process.chdir(oldCwd);
}
assert.equal(fs.readFileSync(path.join(temp, 'server/platform.mjs'), 'utf8'), onceServer);
assert.equal(fs.readFileSync(path.join(temp, 'client/src/pages/VisitorAccessPage.tsx'), 'utf8'), onceClient);

fs.rmSync(temp, { recursive: true, force: true });
console.log('P1 Visitor outage recovery regression: ok');
