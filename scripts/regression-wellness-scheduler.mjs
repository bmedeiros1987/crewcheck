// CrewCheck Life Operations — regressão do Wellness Scheduler + calendário "Academia".
// Empacota os módulos reais (após a cadeia v139) e roda contra um Google Calendar simulado
// atrás da allowlist REAL do proxy do servidor.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
if (!fs.readFileSync('client/src/lib/googleCalendarSync.ts', 'utf8').includes("from './googleCalendarOAuthBridge'")) {
  await import(pathToFileURL(path.join(root, 'scripts/v139/apply.mjs')).href);
}

const results = [];
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log(`OK ${results.length}. ${name}`);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-wellness-'));
for (const key of ['DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL']) delete process.env[key];
process.chdir(scratch);
const server = await import(pathToFileURL(path.join(root, 'server/v1405/google-calendar-oauth.mjs')).href);
process.chdir(root);

const { build } = await import('esbuild');
const bundlePath = path.join(scratch, 'wellness-bundle.mjs');
await build({
  stdin: {
    contents: [
      "export { rosterDutyIntervals } from './client/src/lib/calendarExport.ts';",
      "export { planWellness, normalizeWellnessPreferences, wellnessEventDescription } from './client/src/lib/wellnessScheduler.ts';",
      "export { buildWellnessPlan, syncWellnessToGoogleCalendar, ensureOwnedCalendar, busyIntervalsFromEvents, saveWellnessPreferences, loadWellnessPreferences, maybeAutoOrganize, readAuthorizedHealthDays } from './client/src/lib/wellnessCalendarSync.ts';",
      "export { syncRosterToGoogleCalendar, saveGoogleCalendarSettings } from './client/src/lib/googleCalendarSync.ts';",
    ].join('\n'),
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile: bundlePath,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

const storage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() };
};
globalThis.window = globalThis;
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.location = { hostname: 'crewcheck.online', origin: 'https://crewcheck.online', href: 'https://crewcheck.online/' };
globalThis.confirm = () => true;
globalThis.dispatchEvent = () => true;
globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
localStorage.setItem('crewcheck_google_calendar_server_bridge_v1', 'connected');

// ---------- Google Calendar simulado (atrás da allowlist real) ----------
const SCHEDULE_CAL = 'c_brunomarina2026@group.calendar.google.com';
const calendars = new Map([
  ['primary', { entry: { id: 'crew.member@gmail.com', summary: 'crew.member@gmail.com', primary: true, accessRole: 'owner' }, events: new Map() }],
  [SCHEDULE_CAL, { entry: { id: SCHEDULE_CAL, summary: 'Bruno & Marina', accessRole: 'owner' }, events: new Map() }],
]);
const ops = { POST: 0, PATCH: 0, DELETE: 0, createCalendar: 0, createBodies: [] };
let nextId = 1;
let failBusy = '';
const writes = [];
const clone = (value) => JSON.parse(JSON.stringify(value));

function zonedToUtc(dateTime, timeZone) {
  const [d, t] = dateTime.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const off = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    const g = (type) => Number(parts.find((p) => p.type === type).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - ms;
  };
  return guess - off(guess - off(guess));
}
function range(event) {
  if (event.start.date) return [Date.parse(`${event.start.date}T00:00:00Z`), Date.parse(`${event.end.date}T00:00:00Z`)];
  if (/[zZ]|[+-]\d\d:\d\d$/.test(event.start.dateTime)) return [Date.parse(event.start.dateTime), Date.parse(event.end.dateTime)];
  return [zonedToUtc(event.start.dateTime, event.start.timeZone), zonedToUtc(event.end.dateTime, event.end.timeZone)];
}
async function ownerFetch(url) {
  const id = decodeURIComponent(String(url).split('/users/me/calendarList/')[1] || '');
  const cal = calendars.get(id) || [...calendars.values()].find((c) => c.entry.id === id);
  return { ok: Boolean(cal), json: async () => (cal ? cal.entry : null) };
}
async function fakeGoogle(pathValue, method, body) {
  if (failBusy && method === 'GET' && pathValue.startsWith(`/calendars/${encodeURIComponent(failBusy)}/events`)) return [503, { ok: false }];
  if (['POST', 'PATCH'].includes(method) && /events/.test(pathValue)) writes.push({ method, body: JSON.parse(body) });
  const route = server.validateGoogleCalendarProxyRequest(pathValue, method);
  if (!route.ok) return [403, { ok: false, code: 'GOOGLE_PATH_BLOCKED' }];
  if (route.kind === 'calendar-list') return [200, { ok: true, data: { items: [...calendars.values()].map((c) => c.entry) } }];
  if (route.kind === 'calendar-create') {
    const createBody = server.sanitizeCalendarCreateBody(body);
    if (!createBody) return [400, { ok: false, code: 'GOOGLE_CALENDAR_CREATE_INVALID' }];
    const id = `c_crewcheck${nextId++}@group.calendar.google.com`;
    calendars.set(id, { entry: { id, summary: createBody.summary, accessRole: 'owner', timeZone: createBody.timeZone }, events: new Map() });
    ops.createCalendar += 1; ops.createBodies.push(createBody);
    return [200, { ok: true, data: { id, summary: createBody.summary } }];
  }
  if (!(await server.assertOwnedCalendar('regression-user', route.calendarId, 'placeholder', ownerFetch))) return [403, { ok: false, code: 'GOOGLE_CALENDAR_NOT_OWNED' }];
  const cal = calendars.get(route.calendarId);
  const params = new URLSearchParams(route.path.split('?')[1] || '');
  const eventId = route.kind === 'event' ? route.path.split('?')[0].split('/').pop() : '';
  if (method === 'GET' && !eventId) {
    const filters = params.getAll('privateExtendedProperty').map((f) => f.split('='));
    const min = Date.parse(params.get('timeMin')); const max = Date.parse(params.get('timeMax'));
    const items = [...cal.events.values()].filter((event) => {
      const [s, e] = range(event);
      return s < max && e > min && filters.every(([k, v]) => event.extendedProperties?.private?.[k] === v);
    });
    return [200, { ok: true, data: { items: clone(items) } }];
  }
  if (method === 'POST') { const event = { ...JSON.parse(body), id: `ev${nextId++}` }; cal.events.set(event.id, event); ops.POST += 1; return [200, { ok: true, data: clone(event) }]; }
  if (method === 'PATCH') {
    const current = cal.events.get(eventId); const patch = JSON.parse(body);
    cal.events.set(eventId, { ...current, ...patch, extendedProperties: { private: { ...(current.extendedProperties?.private || {}), ...(patch.extendedProperties?.private || {}) } } });
    ops.PATCH += 1; return [200, { ok: true, data: clone(cal.events.get(eventId)) }];
  }
  if (method === 'DELETE') { cal.events.delete(eventId); ops.DELETE += 1; return [200, { ok: true, data: null }]; }
  return [405, { ok: false }];
}
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  if (url === '/api/google-calendar/oauth/proxy') {
    const body = JSON.parse(init.body);
    const [status, payload] = await fakeGoogle(body.path, body.method, body.body);
    return json(status, payload);
  }
  if (url === '/api/calendar-feed') return json(200, {});
  if (url.startsWith('/api/google-calendar/oauth/status')) return json(200, { ok: true, connected: true, state: 'connected' });
  throw new Error(`fetch inesperado: ${url}`);
};

const w = await import(pathToFileURL(bundlePath).href);

// ---------- fixtures ----------
const leg = (flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType = 'A328') => ({ flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType });
const day = (date, fields = {}) => ({ date, dayOfWeek: '', type: 'VOO', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB', ...fields });
const roster = (days) => ({ crewName: 'TRIPULANTE TESTE', crewId: 'BP-TESTE', base: 'BSB', rank: 'CCM', month: 10, year: 2026, rawText: '', days });
const plan = (r, options = {}) => w.buildWellnessPlan(r, { references: [], ...options });
const byDate = (plans, date) => { const found = plans.find((p) => p.date === date); assert.ok(found, `plano ausente para ${date}`); return found; };
const minutesOf = (clock) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

// Escala-base: C/O 13:10 em 21/10 (caso do enunciado).
const coDay = roster([
  day('21/10/2026', { dutyReport: '05:30', dutyDebrief: '13:10', legs: [leg('LA3500', 'BSB', 'GRU', '06:20', '08:05'), leg('LA3501', 'GRU', 'BSB', '10:50', '12:40')] }),
  day('22/10/2026', { type: 'DO', pairingCode: 'DO' }),
]);

await check('Regra de 8h: nenhum treino antes de C/O + 8h (13:10 → 21:10)', async () => {
  const p = byDate(plan(coDay, { references: [{ date: '2026-10-21', start: '19:00', end: '19:30', availability: 'limited' }] }), '2026-10-21');
  assert.ok(p.window, 'há janela após 21:10');
  assert.equal(p.window.startLocal, '21:10');
  assert.ok(p.adjustedFromReference);
  assert.match(p.adjustmentNote, /19:00–19:30.*21:10/);
  const custom = byDate(plan(coDay, { references: [{ date: '2026-10-21', start: '19:00', end: '19:30', availability: 'limited' }], preferences: { minimumRecoveryBeforeWorkoutHours: 6 } }), '2026-10-21');
  assert.equal(custom.window.startLocal, '19:10', 'parâmetro configurável (6h) muda o limite');
});

await check('Margem antes da próxima apresentação (4h, configurável)', async () => {
  const r = roster([
    day('20/10/2026', { type: 'DO', pairingCode: 'DO' }),
    day('21/10/2026', { dutyReport: '14:00', dutyDebrief: '20:00', legs: [leg('LA3600', 'BSB', 'GIG', '14:50', '16:40'), leg('LA3601', 'GIG', 'BSB', '17:30', '19:20')] }),
  ]);
  const p = byDate(plan(r, { references: [{ date: '2026-10-21', start: '09:30', end: '10:30', availability: 'good' }] }), '2026-10-21');
  assert.ok(minutesOf(p.window.endLocal) <= minutesOf('10:00'), `fim ${p.window.endLocal} deve ser ≤ 10:00`);
  const wider = byDate(plan(r, { references: [{ date: '2026-10-21', start: '09:30', end: '10:30', availability: 'good' }], preferences: { minimumBufferBeforeDutyHours: 3 } }), '2026-10-21');
  assert.equal(`${wider.window.startLocal}–${wider.window.endLocal}`, '09:30–10:30');
});

await check('Folga (DO) e férias (VC) liberam treino completo pela manhã', async () => {
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' }), day('24/10/2026', { type: 'DO', pairingCode: 'VC' })]);
  const plans = plan(r);
  for (const date of ['2026-10-22', '2026-10-24']) {
    const p = byDate(plans, date);
    assert.equal(p.decision, 'TRAIN');
    assert.equal(p.window.startLocal, '08:30');
  }
  assert.equal(byDate(plans, '2026-10-24').intensity, 'complete', 'dias não consecutivos: treino completo');
  const consecutive = plan(roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' }), day('23/10/2026', { type: 'DO', pairingCode: 'DO' })]));
  assert.equal(byDate(consecutive, '2026-10-23').intensity, 'moderate', 'evita dois treinos completos seguidos');
});

await check('HSB limita a recuperação perto de casa; ASB = descanso', async () => {
  const r = roster([day('22/10/2026', { type: 'HSB', pairingCode: 'HSB' }), day('23/10/2026', { type: 'ASB', pairingCode: 'ASB' })]);
  const plans = plan(r, { references: [{ date: '2026-10-22', start: '08:30', end: '10:30', availability: 'ideal' }, { date: '2026-10-23', start: '08:30', end: '10:30', availability: 'ideal' }] });
  assert.equal(byDate(plans, '2026-10-22').decision, 'RECOVERY');
  assert.ok(byDate(plans, '2026-10-22').factors.some((f) => /HSB/.test(f.text)));
  assert.equal(byDate(plans, '2026-10-23').decision, 'REST');
  assert.equal(byDate(plans, '2026-10-23').window, null);
});

await check('Voo de madrugada reduz a carga (sem referência)', async () => {
  const night = roster([
    day('24/10/2026', { dutyReport: '22:30', dutyDebrief: '05:40', isNextDay: true, legs: [leg('LA3700', 'BSB', 'MAO', '23:20', '01:05'), leg('LA3701', 'MAO', 'BSB', '01:40', '05:10')] }),
    day('25/10/2026', { type: 'DO', pairingCode: 'DO' }),
  ]);
  const p = byDate(plan(night), '2026-10-25');
  assert.ok(p.factors.some((f) => !f.ok && /madrugada/.test(f.text)));
  assert.notEqual(p.intensity, 'complete');
  assert.ok(minutesOf(p.window.startLocal) >= minutesOf('13:40'), 'C/O 05:40 + 8h');
});

await check('Jornada +1 (31/10 C/O 00:05) empurra o 01/11 para depois de 08:05', async () => {
  const r = roster([
    day('31/10/2026', { dutyReport: '13:50', dutyDebrief: '00:05', isNextDay: true, legs: [leg('LA4774', 'BSB', 'AJU', '14:40', '16:50'), leg('LA4775', 'AJU', 'BSB', '17:35', '19:45'), leg('LA3312', 'BSB', 'SLZ', '21:10', '23:35')] }),
    day('01/11/2026', { type: 'LAYOVER', pairingCode: '', base: 'SLZ' }),
  ]);
  const p = byDate(plan(r, { references: [{ date: '2026-11-01', start: '07:00', end: '08:00', availability: 'good' }] }), '2026-11-01');
  assert.equal(p.timeZone, 'America/Fortaleza', 'pernoite em SLZ usa o fuso local');
  assert.equal(p.window.startLocal, '08:05');
  const oct31 = byDate(plan(r, { references: [{ date: '2026-10-31', start: '18:00', end: '18:45', availability: 'moderate' }] }), '2026-10-31');
  assert.ok(!oct31.window || minutesOf(oct31.window.endLocal) <= minutesOf('09:50'), 'treino em 31/10 só até C/I 13:50 − 4h');
});

await check('Conflito com compromisso pessoal desloca a janela', async () => {
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })]);
  const busy = [{ startUtcMs: Date.parse('2026-10-22T11:00:00Z'), endUtcMs: Date.parse('2026-10-22T13:00:00Z') }]; // 08:00–10:00 BRT
  const p = byDate(plan(r, { busy }), '2026-10-22');
  const start = minutesOf(p.window.startLocal); const end = minutesOf(p.window.endLocal);
  assert.ok(end <= minutesOf('08:00') || start >= minutesOf('10:00'), `janela ${p.window.startLocal}–${p.window.endLocal} não pode cruzar 08:00–10:00`);
  assert.ok(p.factors.some((f) => /compromisso pessoal/.test(f.text)));
});

const baseline = (date, sleep, rhr) => ({ date, sleepMinutes: sleep, restingHeartRate: rhr, provenance: Object.fromEntries(['sleepMinutes', 'restingHeartRate'].map(k => [k, { start: `${date}T03:00:00Z`, end: `${date}T10:00:00Z`, periodDays: 1 }])) });
const history = ['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'].map((d) => baseline(d, 420, 58));

await check('Sono insuficiente (vs. linha de base pessoal) reduz a carga', async () => {
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })]);
  const p = byDate(plan(r, { health: [...history, baseline('2026-10-22', 270, 58)] }), '2026-10-22');
  assert.ok(['light', 'recovery'].includes(p.intensity));
  assert.ok(p.factors.some((f) => /Sono .*abaixo do seu habitual/.test(f.text)));
  assert.equal(p.confidence, 'alta');
});

await check('Sem Health Connect: "Dado não disponível", sem inventar', async () => {
  const p = byDate(plan(roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })])), '2026-10-22');
  assert.equal(p.health.available, false);
  assert.equal(p.health.sleep, 'Dado não disponível');
  assert.equal(p.health.restingHeartRate, 'Dado não disponível');
  assert.ok(p.factors.some((f) => /dado não disponível/.test(f.text)));
  assert.doesNotMatch(w.wellnessEventDescription(p), /HRV/, 'HRV não existe na fonte: não aparece');
});

await check('FC de repouso acima da linha de base pessoal', async () => {
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })]);
  const p = byDate(plan(r, { health: [...history, baseline('2026-10-22', 420, 64)] }), '2026-10-22');
  assert.ok(p.factors.some((f) => /FC repouso 10% acima da sua média/.test(f.text)));
  assert.ok(['light', 'recovery'].includes(p.intensity));
  const normal = byDate(plan(r, { health: [...history, baseline('2026-10-22', 420, 58)] }), '2026-10-22');
  assert.equal(normal.intensity, 'complete', 'mesma FC da média não reduz');
});

await check('Fuso OPS: pernoite em Sinop planeja em America/Cuiaba', async () => {
  const r = roster([
    day('29/10/2026', { dutyReport: '13:50', dutyDebrief: '15:50', legs: [leg('LA3968', 'BSB', 'OPS', '14:35', '15:20')] }),
    day('30/10/2026', { type: 'LAYOVER', pairingCode: '', base: 'OPS' }),
  ]);
  const p = byDate(plan(r, { references: [{ date: '2026-10-30', start: '09:30', end: '10:30', availability: 'good' }] }), '2026-10-30');
  assert.equal(p.timeZone, 'America/Cuiaba');
  assert.equal(`${p.window.startLocal}–${p.window.endLocal}`, '09:30–10:30');
  assert.doesNotMatch(w.wellnessEventDescription(p), /C\/O|OPS|Sono/);
});

// ---------- Google: Academia separado, idempotência, pessoais preservados ----------
const NOW = Date.parse('2026-10-20T09:00:00-03:00');
const octRoster = roster([
  day('20/10/2026', { type: 'DO', pairingCode: 'DO' }),
  day('21/10/2026', { dutyReport: '05:30', dutyDebrief: '13:10', legs: [leg('LA3036', 'CGH', 'CNF', '06:20', '07:30', 'PS'), leg('LA3201', 'CNF', 'BSB', '10:50', '12:40')] }),
  day('22/10/2026', { type: 'HSB', pairingCode: 'HSB' }),
  day('24/10/2026', { type: 'DO', pairingCode: 'VC' }),
  day('26/10/2026', { dutyReport: '08:35', dutyDebrief: '19:20', legs: [leg('LA3280', 'BSB', 'VCP', '09:20', '11:00', 'OP', '39R'), leg('LA3281', 'VCP', 'BSB', '11:40', '13:15', 'OP', '39R'), leg('LA3968', 'BSB', 'OPS', '14:35', '15:20'), leg('LA3969', 'OPS', 'BSB', '16:00', '18:50')] }),
]);
const octRefs = [
  { date: '2026-10-20', start: '18:00', end: '18:45', availability: 'moderate' },
  { date: '2026-10-21', start: '19:00', end: '19:30', availability: 'limited' },
  { date: '2026-10-22', start: '20:00', end: '20:25', availability: 'limited' },
  { date: '2026-10-24', start: '08:30', end: '10:30', availability: 'ideal' },
  { date: '2026-10-26', start: '20:00', end: '20:25', availability: 'limited' },
];
const personalAcademia = { summary: 'Personal trainer (marcado por mim)', start: { dateTime: '2026-10-24T09:00:00-03:00' }, end: { dateTime: '2026-10-24T10:00:00-03:00' } };
const personalPrimary = { id: 'personalprimary', summary: 'Jantar', description: '#CREWCHECK no texto não basta', start: { dateTime: '2026-10-20T18:15:00-03:00' }, end: { dateTime: '2026-10-20T20:00:00-03:00' } };
calendars.get('primary').events.set(personalPrimary.id, clone(personalPrimary));
w.saveGoogleCalendarSettings({ selectedCalendarId: SCHEDULE_CAL, selectedCalendarName: 'Bruno & Marina', autoSync: true, exportMode: 'flights-rest', includeFinancialNotes: false });

let first;
await check('Calendário Academia inexistente é criado (somente nome/fuso)', async () => {
  first = await w.syncWellnessToGoogleCalendar(octRoster, { now: NOW, references: octRefs, health: [] });
  assert.equal(first.calendarCreated, true);
  assert.equal(ops.createCalendar, 1);
  assert.deepEqual(Object.keys(ops.createBodies[0]).sort(), ['description', 'summary', 'timeZone']);
  assert.equal(ops.createBodies[0].summary, 'Academia');
  assert.equal(first.created, first.total);
  assert.ok(first.total >= 4);
});

const academiaId = () => [...calendars.entries()].find(([, c]) => c.entry.summary === 'Academia')[0];

await check('Calendário Academia já existente é reutilizado (sem duplicata)', async () => {
  const again = await w.ensureOwnedCalendar('Academia', { createIfMissing: true, timeZone: 'America/Sao_Paulo' });
  assert.equal(again.created, false);
  assert.equal(again.id, academiaId());
  assert.equal([...calendars.values()].filter((c) => c.entry.summary === 'Academia').length, 1);
});

await check('Academia separado de "Bruno & Marina"', async () => {
  const academia = [...calendars.get(academiaId()).events.values()];
  assert.ok(academia.every((e) => e.extendedProperties.private.crewcheckDomain === 'wellness'));
  assert.equal(calendars.get(SCHEDULE_CAL).events.size, 0, 'sync de bem-estar não escreve no calendário da escala');
  const schedule = await w.syncRosterToGoogleCalendar(octRoster, { selectedCalendarId: SCHEDULE_CAL, selectedCalendarName: 'Bruno & Marina', autoSync: true, exportMode: 'flights-rest', includeFinancialNotes: false });
  assert.ok(schedule.created > 0);
  assert.equal(calendars.get(academiaId()).events.size, academia.length, 'sync da escala não toca a Academia');
  const titles = academia.map((e) => e.summary);
  assert.ok(titles.every(t => /Atividade pessoal|Reserva pessoal/.test(t)));
  assert.ok(titles.some((t) => t.startsWith('Academia')));
});

await check('Treino após C/O respeita 8h e jantar pessoal é evitado', async () => {
  const events = [...calendars.get(academiaId()).events.values()];
  const oct21 = events.find((e) => e.extendedProperties.private.crewcheckEventKey === 'wellness|2026-10-21');
  assert.equal(oct21.start.dateTime, '2026-10-21T21:10:00', 'C/O 13:10 + 8h');
  const oct20 = events.find((e) => e.extendedProperties.private.crewcheckEventKey === 'wellness|2026-10-20');
  const [s, e] = range(oct20);
  const [ps, pe] = range(personalPrimary);
  assert.ok(e <= ps || s >= pe, 'não cruza o jantar pessoal 18:15–20:00');
  const oct26 = events.find((ev) => ev.extendedProperties.private.crewcheckEventKey === 'wellness|2026-10-26');
  assert.ok(oct26.start.date, '26/10: referência 20:00 cai antes de C/O 19:20 + 8h → descanso');
  assert.equal(oct26.summary, 'Academia · Reserva pessoal');
  assert.doesNotMatch(oct26.description, /Ajuste|Relatório|recuperação/i);
});

await check('Idempotência: 2ª sincronização sem mudança = 0/0/0', async () => {
  const before = { ...ops };
  const second = await w.syncWellnessToGoogleCalendar(octRoster, { now: NOW, references: octRefs, health: [] });
  assert.deepEqual([second.created, second.updated, second.deleted], [0, 0, 0]);
  assert.equal(second.unchanged, second.total);
  assert.deepEqual([ops.POST - before.POST, ops.PATCH - before.PATCH, ops.DELETE - before.DELETE, ops.createCalendar - before.createCalendar], [0, 0, 0, 0]);
});

await check('Eventos pessoais preservados (Academia e principal)', async () => {
  const cal = calendars.get(academiaId());
  cal.events.set('mine', { id: 'mine', ...clone(personalAcademia) });
  const third = await w.syncWellnessToGoogleCalendar(octRoster, { now: NOW, references: octRefs, health: [] });
  assert.deepEqual(cal.events.get('mine'), { id: 'mine', ...personalAcademia }, 'evento pessoal na Academia intocado');
  assert.deepEqual(calendars.get('primary').events.get('personalprimary'), personalPrimary);
  const oct24 = [...cal.events.values()].find((e) => e.extendedProperties?.private?.crewcheckEventKey === 'wellness|2026-10-24');
  const [s, e] = range(oct24);
  const [ps, pe] = range(personalAcademia);
  assert.ok(e <= ps || s >= pe, 'treino de 24/10 sai do horário do personal trainer');
  assert.ok(third.updated >= 1);
});

await check('Mudança de escala depois da Academia criada: recalcula (PATCH/DELETE)', async () => {
  const changed = clone(octRoster);
  changed.days[1].dutyDebrief = '15:40'; // C/O 21/10 atrasou
  changed.days = changed.days.filter((d) => d.date !== '22/10/2026'); // HSB removido da escala
  const result = await w.syncWellnessToGoogleCalendar(changed, { now: NOW, references: octRefs.filter((r) => r.date !== '2026-10-22'), health: [] });
  const events = [...calendars.get(academiaId()).events.values()];
  const oct21 = events.find((e) => e.extendedProperties?.private?.crewcheckEventKey === 'wellness|2026-10-21');
  assert.ok(!oct21 || oct21.start.date, '15:40 + 8h = 23:40 passa do limite 22:30 → sem treino');
  assert.ok(result.updated + result.deleted >= 1);
  assert.equal(events.filter((e) => e.extendedProperties?.private?.crewcheckEventKey === 'wellness|2026-10-22').length, 0, 'HSB removido some do calendário');
});

await check('Proxy: criação só de calendário, com corpo restrito', async () => {
  assert.equal(server.validateGoogleCalendarProxyRequest('/calendars', 'POST').ok, true);
  assert.equal(server.validateGoogleCalendarProxyRequest('/calendars', 'GET').ok, false);
  assert.equal(server.validateGoogleCalendarProxyRequest('/calendars?foo=1', 'POST').ok, false);
  assert.equal(server.validateGoogleCalendarProxyRequest('/calendars/primary', 'DELETE').ok, false);
  assert.equal(server.validateGoogleCalendarProxyRequest('/calendars/primary/acl', 'POST').ok, false);
  assert.equal(server.sanitizeCalendarCreateBody({ summary: 'Academia', timeZone: 'America/Sao_Paulo' })?.summary, 'Academia');
  assert.equal(server.sanitizeCalendarCreateBody({ summary: 'Academia', acl: [{ role: 'reader' }] }), null);
  assert.equal(server.sanitizeCalendarCreateBody({ summary: '' }), null);
  assert.equal(server.sanitizeCalendarCreateBody({ summary: 'x', timeZone: '../../etc' }), null);
});

await check('Preferências editáveis com padrões 8h/4h', async () => {
  const prefs = w.loadWellnessPreferences();
  assert.equal(prefs.minimumRecoveryBeforeWorkoutHours, 8);
  assert.equal(prefs.minimumBufferBeforeDutyHours, 4);
  assert.equal(prefs.academiaCalendarName, 'Academia');
  assert.equal(prefs.scheduleCalendarName, 'Bruno & Marina');
  const saved = w.saveWellnessPreferences({ minimumRecoveryBeforeWorkoutHours: 10, autoOrganize: true });
  assert.equal(saved.minimumRecoveryBeforeWorkoutHours, 10);
  assert.equal(w.loadWellnessPreferences().autoOrganize, true);
  w.saveWellnessPreferences({ minimumRecoveryBeforeWorkoutHours: 99 });
  assert.equal(w.loadWellnessPreferences().minimumRecoveryBeforeWorkoutHours, 8, 'valor inválido volta ao padrão');
});

await check('Missing, exercise-only, stale and aggregate evidence never imply recovery', async () => {
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })]);
  for (const today of [{ date: '2026-10-22' }, { date: '2026-10-22', exerciseMinutes: 90 }, { ...baseline('2026-10-22', 420, 58), provenance: { restingHeartRate: { start: '2026-10-15T10:00:00Z', end: '2026-10-22T10:00:00Z', periodDays: 7 } } }, { ...baseline('2026-10-22', 420, 58), provenance: {} }, { ...baseline('2026-10-22', 420, 58), provenance: { sleepMinutes: { start: '2026-10-20T03:00:00Z', end: '2026-10-20T10:00:00Z', periodDays: 1 } } }]) {
    const p = byDate(plan(r, { health: [...history, today] }), '2026-10-22');
    assert.equal(p.health.recovery, 'Dado não disponível');
    assert.notEqual(p.confidence, 'alta');
    assert.doesNotMatch(p.reason, /recuperação dentro/);
  }
  const invalidHistory = history.map(h => ({ ...h, provenance: {} }));
  const p = byDate(plan(r, { health: [...invalidHistory, baseline('2026-10-22', 420, 58)] }), '2026-10-22');
  assert.notEqual(p.confidence, 'alta');
  assert.equal(p.health.recovery, 'Dado não disponível');
  for (const weak of [history.slice(0, 2), ['2026-08-01', '2026-08-02', '2026-08-03'].map(d => baseline(d, 420, 58))]) {
    const unknown = byDate(plan(r, { health: [...weak, baseline('2026-10-22', 420, 58)] }), '2026-10-22');
    assert.equal(unknown.health.recovery, 'Dado não disponível');
    assert.notEqual(unknown.confidence, 'alta');
  }
});

await check('Fresh capture preserves old sleep date, dedupes session and excludes multi-day RHR', async () => {
  const session = { sleepStart: '2026-10-19T19:00:00Z', sleepEnd: '2026-10-20T02:00:00Z', sleepMinutes: 420, restingHeartRateAverage: 58, steps: 7777, activityMinutes: 70, periodDays: 7 };
  localStorage.setItem('crewcheck:life:health-history:v1', JSON.stringify([{ ...session, capturedAt: '2026-10-22T12:00:00Z' }, { ...session, capturedAt: '2026-10-21T12:00:00Z' }]));
  const days = w.readAuthorizedHealthDays('America/Sao_Paulo');
  assert.equal(days.length, 1);
  assert.equal(days[0].date, '2026-10-19');
  assert.equal(days[0].provenance.sleepMinutes.end, session.sleepEnd);
  assert.equal(days[0].restingHeartRate, undefined);
  assert.equal(days[0].steps, undefined);
  assert.equal(w.readAuthorizedHealthDays('Etc/UTC')[0].date, '2026-10-20');
  localStorage.removeItem('crewcheck:life:health-history:v1');
});

await check('POST and PATCH exclude health and derived reasons, including health-derived REST', async () => {
  writes.length = 0;
  const r = roster([day('22/10/2026', { type: 'DO', pairingCode: 'DO' })]);
  const opts = { now: NOW, references: [], health: [...history, baseline('2026-10-22', 100, 90)], preferences: { academiaCalendarName: 'Synthetic privacy' } };
  await w.syncWellnessToGoogleCalendar(r, opts);
  const cal = [...calendars.values()].find(c => c.entry.summary === 'Synthetic privacy');
  for (const e of cal.events.values()) { e.description = 'legacy health'; e.extendedProperties.private.crewcheckHash = 'legacy'; }
  await w.syncWellnessToGoogleCalendar(r, opts);
  assert.ok(writes.some(w => w.method === 'POST'));
  assert.ok(writes.some(w => w.method === 'PATCH'));
  for (const { body } of writes) {
    assert.doesNotMatch(JSON.stringify(body), /bpm|sono|repouso|baseline|passos|recupera|motivo|confiança|percent|90|100/i);
    assert.equal(body.colorId, '2');
    assert.equal(body.location, undefined);
    assert.deepEqual(Object.keys(body.extendedProperties.private).sort(), ['crewcheck', 'crewcheckCrew', 'crewcheckDomain', 'crewcheckEventKey', 'crewcheckHash', 'crewcheckKeyVersion']);
    assert.match(body.extendedProperties.private.crewcheckEventKey, /^wellness\|2026-10-22$/);
    assert.equal(body.extendedProperties.private.crewcheck, 'true');
    assert.equal(body.extendedProperties.private.crewcheckDomain, 'wellness');
  }
  const identities = [...cal.events.keys()];
  const before = [ops.POST, ops.PATCH, ops.DELETE, ops.createCalendar];
  for (let i = 0; i < 2; i++) {
    const repeat = await w.syncWellnessToGoogleCalendar(r, opts);
    assert.deepEqual([repeat.created, repeat.updated, repeat.deleted], [0, 0, 0]);
  }
  assert.deepEqual([...cal.events.keys()], identities);
  assert.deepEqual([ops.POST, ops.PATCH, ops.DELETE, ops.createCalendar], before);
});

await check('Busy read failure aborts without event mutations or personal deletion', async () => {
  const before = [ops.POST, ops.PATCH, ops.DELETE, ops.createCalendar];
  for (const calendarId of ['primary', SCHEDULE_CAL, academiaId()]) {
    failBusy = calendarId;
    await assert.rejects(w.syncWellnessToGoogleCalendar(octRoster, { now: NOW, references: octRefs, health: [] }), /Disponibilidade.*não verificada/);
    assert.deepEqual([ops.POST, ops.PATCH, ops.DELETE, ops.createCalendar], before);
  }
  // Missing target: busy-read failure must not even create a calendar.
  failBusy = 'primary';
  await assert.rejects(w.syncWellnessToGoogleCalendar(octRoster, { now: NOW, preferences: { academiaCalendarName: 'Must not be created' }, references: octRefs, health: [] }), /Disponibilidade.*não verificada/);
  assert.deepEqual([ops.POST, ops.PATCH, ops.DELETE, ops.createCalendar], before);
  assert.ok(![...calendars.values()].some(c => c.entry.summary === 'Must not be created'));
  failBusy = '';
  assert.deepEqual(calendars.get('primary').events.get('personalprimary'), personalPrimary);
});

await check('Today card requires exact date and labels unverified availability', async () => {
  const source = fs.readFileSync(path.join(root, 'client/src/components/wellness/WellnessRecoveryCard.tsx'), 'utf8');
  assert.doesNotMatch(source, /plans\[0\]/);
  assert.match(source, /AGENDA NÃO VERIFICADA/);
});

fs.rmSync(scratch, { recursive: true, force: true });
console.log(`Wellness Scheduler: ${results.length} cenários OK.`);
