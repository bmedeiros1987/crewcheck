import fs from 'node:fs';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[p1-visitor-outage] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[p1-visitor-outage] Âncora ausente: ${label}`);
  return source.replace(before, after);
}

update('server/platform.mjs', (source) => {
  let next = source;

  next = replaceOnce(next,
`async function handleVisitorData(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });`,
`async function handleVisitorData(req, res) {
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });`,
    'handleVisitorData');

  next = replaceOnce(next,
`async function handleVisitorEmergency(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = await readBody(req, 200_000);
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });`,
`async function handleVisitorEmergency(req, res) {
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = await readBody(req, 200_000);`,
    'handleVisitorEmergency');

  next = replaceOnce(next,
`async function handleVisitorChat(req, res) {
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });`,
`async function handleVisitorChat(req, res) {
  const db = await pool();
  if (!db) return sendJson(res, 503, { ok: false, message: 'Banco indisponível.' });
  const identity = visitorIdentity(req);
  if (!identity) return sendJson(res, 401, { ok: false, message: 'Acesso de visitante expirado.' });
  const body = req.method === 'POST' ? await readBody(req, 100_000) : {};`,
    'handleVisitorChat');

  return next;
});

update('client/src/pages/VisitorAccessPage.tsx', (source) => {
  let next = source;

  next = replaceOnce(next,
`  const [mode, setMode] = useState<'loading' | 'accept' | 'login' | 'portal'>('loading');`,
`  const [mode, setMode] = useState<'loading' | 'accept' | 'login' | 'portal' | 'unavailable'>('loading');`,
    'visitor mode union');

  next = replaceOnce(next,
`  async function loadPortal() {
    try {
      const result = await visitorRequest('/api/platform/visitor/data');
      setData(result);
      const allowed = result?.visitor?.permissions || {};
      setTab(allowed.roster ? 'roster' : allowed.hotels ? 'hotels' : allowed.map ? 'map' : allowed.chat ? 'chat' : 'emergency');
      setMode('portal'); setError(''); return true;
    }
    catch { return false; }
  }`,
`  async function loadPortal() {
    try {
      const result = await visitorRequest('/api/platform/visitor/data');
      setData(result);
      const allowed = result?.visitor?.permissions || {};
      setTab(allowed.roster ? 'roster' : allowed.hotels ? 'hotels' : allowed.map ? 'map' : allowed.chat ? 'chat' : 'emergency');
      setMode('portal'); setError(''); return true;
    }
    catch (reason: any) {
      if (reason?.status === 401) return false;
      setError(reason instanceof Error ? reason.message : 'Serviço temporariamente indisponível. Tente novamente.');
      setMode('unavailable');
      return true;
    }
  }`,
    'loadPortal classification');

  next = replaceOnce(next,
`  if (mode === 'loading') return <main className="cv-public"><section className="cv-state"><Loader2 className="cv-spin"/><h1>CrewCheck</h1></section></main>;`,
`  if (mode === 'loading') return <main className="cv-public"><section className="cv-state"><Loader2 className="cv-spin"/><h1>CrewCheck</h1></section></main>;
  if (mode === 'unavailable') return <main className="cv-public"><section className="cv-state"><AlertTriangle/><h1>CrewCheck</h1><p>{error || 'Serviço temporariamente indisponível.'}</p><button type="button" onClick={() => { setMode('loading'); void loadPortal().then((active) => { if (!active) setMode('login'); }); }}>Tentar novamente</button></section></main>;`,
    'recoverable visitor outage UI');

  return next;
});

console.log('[p1-visitor-outage] Visitor mantém sessão/contexto em indisponibilidade transitória e reserva login para 401 real.');
