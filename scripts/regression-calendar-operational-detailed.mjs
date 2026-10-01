// Calendar Operational Detailed — regressão ponta a ponta da integração Google Calendar.
// Empacota calendarExport.ts + googleCalendarSync.ts reais (após a cadeia v139), roda a
// sincronização contra um Google Calendar simulado atrás da allowlist REAL do proxy do servidor
// e cobre: jornada + etapas, OP×PS, cores, VC≠DO, +1, OPS/America/Cuiaba, 31/10 até 00:05,
// continuação 02/11, upsert idempotente, evento pessoal intacto, calendário secundário,
// bloqueio de caminho malicioso e OAuth fora da WebView.
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

// ---------- servidor real (allowlist + início OAuth), isolado em diretório temporário ----------
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-gcal-'));
for (const key of ['DATABASE_URL', 'CREWCHECK_DATABASE_URL', 'MYSQL_URL']) delete process.env[key];
process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET = 'regression-placeholder-not-a-secret';
process.env.CREWCHECK_GOOGLE_TOKEN_ENCRYPTION_KEY = 'regression-placeholder-not-a-secret';
process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://crewcheck.online/api/google-calendar/oauth/callback';
process.chdir(scratch);
const server = await import(pathToFileURL(path.join(root, 'server/v1405/google-calendar-oauth.mjs')).href);
process.chdir(root);

// ---------- bundle do cliente ----------
const { build } = await import('esbuild');
const bundlePath = path.join(scratch, 'calendar-bundle.mjs');
await build({
  stdin: {
    contents: [
      "export { generateICalendar, airportTimeZone, zonedLocalTimeToUtcMs } from './client/src/lib/calendarExport.ts';",
      "export { syncRosterToGoogleCalendar, listGoogleCalendars, saveGoogleCalendarSettings, loadGoogleCalendarSettings, connectGoogleCalendar, normalizeGoogleCalendarId } from './client/src/lib/googleCalendarSync.ts';",
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

// ---------- ambiente de navegador mínimo ----------
const storage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), clear: () => map.clear() };
};
globalThis.window = globalThis;
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.location = { hostname: 'crewcheck.online', origin: 'https://crewcheck.online', href: 'https://crewcheck.online/' };
globalThis.confirm = () => true;
const windowOpenCalls = [];
globalThis.open = (url) => { windowOpenCalls.push(url); return null; };
localStorage.setItem('crewcheck_google_calendar_server_bridge_v1', 'connected');

// ---------- Google Calendar simulado ----------
const BRUNO_MARINA = 'c_brunomarina2026@group.calendar.google.com';
const READER_CAL = 'pt.brazilian#holiday@group.v.calendar.google.com';
const calendars = new Map([
  ['primary', { entry: { id: 'crew.member@gmail.com', summary: 'crew.member@gmail.com', primary: true, accessRole: 'owner' }, events: new Map() }],
  [BRUNO_MARINA, { entry: { id: BRUNO_MARINA, summary: 'Bruno & Marina', accessRole: 'owner' }, events: new Map() }],
  ['feriados@group.v.calendar.google.com', { entry: { id: 'feriados@group.v.calendar.google.com', summary: 'Feriados', accessRole: 'reader' }, events: new Map() }],
]);
const ops = { POST: 0, PATCH: 0, DELETE: 0, blocked: [] };
let nextId = 1;
const clone = (value) => JSON.parse(JSON.stringify(value));

function zonedToUtc(dateTime, timeZone) {
  const [d, t] = dateTime.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  const offset = (ms) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms));
    const g = (type) => Number(parts.find((p) => p.type === type).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - ms;
  };
  return guess - offset(guess - offset(guess));
}
function eventRange(event) {
  if (event.start.date) return [Date.parse(`${event.start.date}T00:00:00Z`), Date.parse(`${event.end.date}T00:00:00Z`)];
  return [zonedToUtc(event.start.dateTime, event.start.timeZone), zonedToUtc(event.end.dateTime, event.end.timeZone)];
}
function wallClock(event, edge, timeZone = 'America/Sao_Paulo') {
  const utc = zonedToUtc(event[edge].dateTime, event[edge].timeZone);
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(utc));
}

async function ownerFetch(url) {
  const id = decodeURIComponent(String(url).split('/users/me/calendarList/')[1] || '');
  const cal = calendars.get(id) || [...calendars.values()].find((c) => c.entry.id === id);
  return { ok: Boolean(cal), json: async () => (cal ? cal.entry : null) };
}

async function fakeGoogle(pathValue, method, body) {
  const route = server.validateGoogleCalendarProxyRequest(pathValue, method);
  if (!route.ok) { ops.blocked.push(pathValue); return [403, { ok: false, code: 'GOOGLE_PATH_BLOCKED' }]; }
  if (route.kind === 'calendar-list') return [200, { ok: true, data: { items: [...calendars.values()].map((c) => c.entry).filter((e) => e.accessRole === 'owner') } }];
  if (!(await server.assertOwnedCalendar('regression-user', route.calendarId, 'placeholder', ownerFetch))) return [403, { ok: false, code: 'GOOGLE_CALENDAR_NOT_OWNED' }];
  const cal = calendars.get(route.calendarId);
  const [, query = ''] = route.path.split('?');
  const params = new URLSearchParams(query);
  const eventId = route.kind === 'event' ? route.path.split('?')[0].split('/').pop() : '';
  if (method === 'GET' && !eventId) {
    const filters = params.getAll('privateExtendedProperty').map((f) => f.split('='));
    const min = Date.parse(params.get('timeMin')); const max = Date.parse(params.get('timeMax'));
    const items = [...cal.events.values()].filter((event) => {
      const [s, e] = eventRange(event);
      if (!(s < max && e > min)) return false;
      return filters.every(([k, v]) => event.extendedProperties?.private?.[k] === v);
    });
    return [200, { ok: true, data: { items: clone(items) } }];
  }
  if (method === 'POST') {
    const event = { ...JSON.parse(body), id: `cc${nextId++}` };
    cal.events.set(event.id, event); ops.POST += 1;
    return [200, { ok: true, data: clone(event) }];
  }
  if (method === 'PATCH') {
    const current = cal.events.get(eventId); const patch = JSON.parse(body);
    const merged = { ...current, ...patch, extendedProperties: { private: { ...(current.extendedProperties?.private || {}), ...(patch.extendedProperties?.private || {}) } } };
    cal.events.set(eventId, merged); ops.PATCH += 1;
    return [200, { ok: true, data: clone(merged) }];
  }
  if (method === 'DELETE') { cal.events.delete(eventId); ops.DELETE += 1; return [200, { ok: true, data: null }]; }
  return [405, { ok: false }];
}

const oauthStarts = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  if (url === '/api/google-calendar/oauth/proxy') {
    const body = JSON.parse(init.body);
    const [status, payload] = await fakeGoogle(body.path, body.method, body.body);
    return json(status, payload);
  }
  if (url === '/api/calendar-feed') return json(200, {});
  if (url === '/api/google-calendar/oauth/start') {
    oauthStarts.push(init.method);
    return json(200, { ok: true, state: 'state-regression', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=state-regression' });
  }
  if (url.startsWith('/api/google-calendar/oauth/status')) return json(200, { ok: true, connected: true, state: 'connected' });
  if (url.startsWith('/api/google-calendar/oauth/health')) return json(200, { ok: true, configured: true });
  throw new Error(`fetch inesperado no teste: ${url}`);
};

const calendar = await import(pathToFileURL(bundlePath).href);

// ---------- escala de referência (outubro/2026 com continuação em novembro) ----------
const leg = (flightNumber, origin, destination, departureTime, arrivalTime, workType = 'OP', aircraftType = 'A328', extra = {}) => ({ flightNumber, origin, destination, departureTime, arrivalTime, workType, aircraftType, ...extra });
const day = (date, fields) => ({ date, dayOfWeek: '', type: 'VOO', pairingCode: '', dutyReport: null, dutyDebrief: null, legs: [], dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'BSB', ...fields });
function buildRoster(overrides = {}) {
  return {
    crewName: 'BRUNO MEDEIROS', crewId: '123456', base: 'BSB', rank: 'CCM', month: 10, year: 2026, rawText: '',
    days: [
      day('20/10/2026', { dutyReport: '05:30', dutyDebrief: '10:20', legs: [leg('LA3036', 'CGH', 'CNF', '06:20', '07:30', 'PS'), leg('LA3201', 'CNF', 'BSB', '08:40', '09:50')] }),
      day('21/10/2026', { dutyReport: '06:00', dutyDebrief: '08:45', legs: [leg('LA3288', 'GRU', 'CWB', '06:45', '08:15', 'PS')] }),
      day('22/10/2026', { type: 'HSB', pairingCode: 'HSB', dutyReport: '06:00', dutyDebrief: '18:00' }),
      day('23/10/2026', { type: 'ASB', pairingCode: 'ASB' }),
      day('24/10/2026', { type: 'DO', pairingCode: 'DO' }),
      day('25/10/2026', { type: 'DO', pairingCode: 'VC' }),
      day('26/10/2026', {
        dutyReport: '08:35', dutyDebrief: '19:20',
        legs: [
          leg('LA3280', 'BSB', 'VCP', '09:20', '11:00', 'OP', '39R', { crew: [{ role: 'CMT', name: 'FULANO DE TAL' }, { role: 'CCM', name: 'BRUNO MEDEIROS', isCurrentCrew: true }] }),
          leg('LA3281', 'VCP', 'BSB', '11:40', overrides.la3281Arrival || '13:15', 'OP', '39R'),
          leg('LA3968', 'BSB', 'OPS', '14:35', '15:20'),
          leg('LA3969', 'OPS', 'BSB', '16:00', '18:50'),
        ],
      }),
      day('27/10/2026', { type: 'DR', pairingCode: 'DR' }),
      ...(overrides.dropDof ? [] : [day('28/10/2026', { type: 'DOF', pairingCode: 'DOF' })]),
      day('31/10/2026', {
        dutyReport: '13:50', dutyDebrief: '00:05', isNextDay: true,
        legs: [leg('LA4774', 'BSB', 'AJU', '14:40', '16:50'), leg('LA4775', 'AJU', 'BSB', '17:35', '19:45'), leg('LA3312', 'BSB', 'SLZ', '21:10', '23:35')],
      }),
      day('01/11/2026', { type: 'LAYOVER', pairingCode: '', hotel: 'Hotel SLZ', base: 'SLZ' }),
      day('02/11/2026', { dutyReport: '03:35', dutyDebrief: '12:05', base: 'SLZ', legs: [leg('LA3295', 'SLZ', 'GRU', '04:10', '07:55', 'OP', 'A321'), leg('LA3263', 'GRU', 'BSB', '09:50', '11:35')] }),
    ],
  };
}

const settings = { selectedCalendarId: 'primary', selectedCalendarName: 'Calendário principal', autoSync: true, exportMode: 'flights-rest', includeFinancialNotes: false };
const events = (id = 'primary') => [...calendars.get(id).events.values()];
const crewcheckEvents = (id = 'primary') => events(id).filter((e) => e.extendedProperties?.private?.crewcheck === 'true' && e.extendedProperties.private.crewcheckCrew === 'bruno-medeiros');
const bySummary = (summary, id = 'primary') => {
  const found = crewcheckEvents(id).filter((e) => e.summary === summary);
  assert.equal(found.length, 1, `evento único esperado: ${summary} (achou ${found.length})`);
  return found[0];
};

// Eventos que NÃO são da escala atual: pessoal (com texto "#CREWCHECK" na descrição de propósito),
// outro tripulante, e um legado CrewCheck do mesmo mês (formato antigo delete-all).
const personal = { id: 'personal1', summary: 'Check-in escala — jantar Marina', description: 'Pessoal. #CREWCHECK no texto não pode bastar.', start: { dateTime: '2026-10-26T20:00:00', timeZone: 'America/Sao_Paulo' }, end: { dateTime: '2026-10-26T22:00:00', timeZone: 'America/Sao_Paulo' } };
const otherCrew = { id: 'othercrew1', summary: 'BSB-GRU', description: '#CREWCHECK', start: { dateTime: '2026-10-26T07:00:00', timeZone: 'America/Sao_Paulo' }, end: { dateTime: '2026-10-26T09:00:00', timeZone: 'America/Sao_Paulo' }, extendedProperties: { private: { crewcheck: 'true', crewcheckPeriodKey: 'crewcheck:outra-pessoa:2026-10:flights-rest' } } };
const legacy = { id: 'legacy1', summary: 'Apres. 08:35 · BSB-VCP-BSB-OPS-BSB', description: '#CREWCHECK', start: { dateTime: '2026-10-26T08:35:00', timeZone: 'America/Sao_Paulo' }, end: { dateTime: '2026-10-26T19:20:00', timeZone: 'America/Sao_Paulo' }, extendedProperties: { private: { crewcheck: 'true', crewcheckPeriodKey: 'crewcheck:bruno-medeiros:2026-10:flights-rest', crewcheckEventKey: 'cc-legacy' } } };
const legacyNovCovered = { id: 'legacynov1', summary: 'Apres. 03:35 · SLZ-GRU-BSB', description: '#CREWCHECK', start: { dateTime: '2026-11-02T03:35:00', timeZone: 'America/Sao_Paulo' }, end: { dateTime: '2026-11-02T12:05:00', timeZone: 'America/Sao_Paulo' }, extendedProperties: { private: { crewcheck: 'true', crewcheckPeriodKey: 'crewcheck:bruno-medeiros:2026-11:flights-rest' } } };
const legacyNovOther = { id: 'legacynov2', summary: 'DO · Folga', description: '#CREWCHECK', start: { date: '2026-11-05' }, end: { date: '2026-11-06' }, extendedProperties: { private: { crewcheck: 'true', crewcheckPeriodKey: 'crewcheck:bruno-medeiros:2026-11:flights-rest' } } };
for (const event of [personal, otherCrew, legacy, legacyNovCovered, legacyNovOther]) calendars.get('primary').events.set(event.id, clone(event));

const first = await calendar.syncRosterToGoogleCalendar(buildRoster(), settings);

await check('Jornada (C/I→C/O) + etapas individuais', async () => {
  const pairing = bySummary('BSB-VCP-BSB-OPS-BSB');
  assert.deepEqual(pairing.start, { dateTime: '2026-10-26T08:35:00', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(pairing.end, { dateTime: '2026-10-26T19:20:00', timeZone: 'America/Sao_Paulo' });
  for (const summary of ['BSB-VCP LA3280', 'VCP-BSB LA3281', 'BSB-OPS LA3968', 'OPS-BSB LA3969']) bySummary(summary);
  const la3280 = bySummary('BSB-VCP LA3280');
  for (const text of ['LA3280: BSB-VCP', '09:20 America/Sao_Paulo', '11:00 America/Sao_Paulo', '12:20 UTC (09:20 LOCAL)', 'Work type: OP', 'Aircraft: 39R', 'Crew: (123456) Bruno Medeiros', 'CCM: Bruno Medeiros (você)', 'Apresentação da jornada: 08:35 LOCAL (BSB)', 'Liberação: 19:20 LOCAL (BSB)', '#CREWCHECK']) {
    assert.ok(la3280.description.includes(text), `descrição LA3280 sem "${text}"`);
  }
  assert.equal(crewcheckEvents().some((e) => /Check-in escala|Verificar escala oficial/.test(e.summary)), false, 'sem eventos auxiliares');
});

await check('OP × PS visualmente diferentes', async () => {
  const ps = bySummary('CGH-CNF LA3036 · PS');
  assert.ok(ps.description.includes('Work type: PS'));
  assert.ok(ps.description.includes('Aircraft: A328'));
  const psOnly = bySummary('GRU-CWB LA3288 · PS');
  assert.ok(psOnly.description.includes('Aircraft: A328'));
  assert.equal(psOnly.end.timeZone, 'America/Sao_Paulo', 'CWB em America/Sao_Paulo');
  const op = bySummary('CNF-BSB LA3201');
  assert.notEqual(ps.colorId, op.colorId);
});

await check('Cores Google (jornada, OP, PS, HSB/ASB, folga, férias)', async () => {
  assert.equal(bySummary('BSB-VCP-BSB-OPS-BSB').colorId, '9');
  assert.equal(bySummary('CGH-CNF-BSB').colorId, '9', 'jornada mista OP+PS mantém cor de jornada');
  assert.equal(bySummary('GRU-CWB').colorId, '8', 'jornada só PS em grafite');
  assert.equal(bySummary('BSB-VCP LA3280').colorId, '1');
  assert.equal(bySummary('CGH-CNF LA3036 · PS').colorId, '8');
  assert.equal(bySummary('HSB · Home Stand By').colorId, '11');
  assert.equal(bySummary('ASB · Airport Stand By').colorId, '11');
  assert.equal(bySummary('DO · Folga').colorId, '2');
  assert.equal(bySummary('VC · Férias').colorId, '10');
  const hsb = bySummary('HSB · Home Stand By');
  assert.deepEqual([hsb.start.dateTime, hsb.end.dateTime], ['2026-10-22T06:00:00', '2026-10-22T18:00:00']);
  assert.deepEqual(bySummary('ASB · Airport Stand By').start, { date: '2026-10-23' });
  assert.ok(bySummary('DR · Descanso regulamentar'));
  assert.ok(bySummary('DOF · Folga'));
});

await check('VC ≠ DO', async () => {
  const vc = bySummary('VC · Férias');
  assert.deepEqual(vc.start, { date: '2026-10-25' });
  assert.ok(vc.description.includes('Férias registradas na escala (VC)'));
  assert.equal(crewcheckEvents().filter((e) => e.summary === 'DO · Folga').length, 1, 'VC não pode virar DO genérico');
});

await check('+1 / virada da meia-noite', async () => {
  const pairing = bySummary('BSB-AJU-BSB-SLZ');
  assert.equal(pairing.end.dateTime, '2026-11-01T00:05:00');
  assert.ok(pairing.description.includes('00:05 LOCAL +1') || pairing.description.includes('(00:05 LOCAL +1)'));
});

await check('OPS em America/Cuiaba (exibição em Brasília: 16:20 e 17:00)', async () => {
  assert.equal(calendar.airportTimeZone('OPS'), 'America/Cuiaba');
  const la3968 = bySummary('BSB-OPS LA3968');
  assert.deepEqual(la3968.start, { dateTime: '2026-10-26T14:35:00', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(la3968.end, { dateTime: '2026-10-26T15:20:00', timeZone: 'America/Cuiaba' });
  assert.equal(wallClock(la3968, 'end'), '16:20');
  assert.ok(la3968.description.includes('15:20 America/Cuiaba'));
  assert.ok(la3968.description.includes('19:20 UTC (15:20 LOCAL)'));
  const la3969 = bySummary('OPS-BSB LA3969');
  assert.deepEqual(la3969.start, { dateTime: '2026-10-26T16:00:00', timeZone: 'America/Cuiaba' });
  assert.equal(wallClock(la3969, 'start'), '17:00');
  assert.ok(la3969.description.includes('16:00 America/Cuiaba'));
  assert.deepEqual(la3969.end, { dateTime: '2026-10-26T18:50:00', timeZone: 'America/Sao_Paulo' });
  // Independência do fuso do aparelho: mesmo iCal em Tóquio e em São Paulo.
  const strip = (ics) => ics.replace(/^DTSTAMP:.*$/gm, '');
  const previous = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  const tokyo = strip(calendar.generateICalendar(buildRoster(), [], { mode: 'flights-rest', calendarStyle: 'operational-detailed' }));
  process.env.TZ = 'America/Sao_Paulo';
  const saoPaulo = strip(calendar.generateICalendar(buildRoster(), [], { mode: 'flights-rest', calendarStyle: 'operational-detailed' }));
  if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  assert.equal(tokyo, saoPaulo, 'saída não pode depender do fuso do aparelho');
});

await check('31/10 forma BSB-AJU-BSB-SLZ até 00:05 (+1)', async () => {
  const pairing = bySummary('BSB-AJU-BSB-SLZ');
  assert.deepEqual(pairing.start, { dateTime: '2026-10-31T13:50:00', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(pairing.end, { dateTime: '2026-11-01T00:05:00', timeZone: 'America/Fortaleza' });
  const la4774 = bySummary('BSB-AJU LA4774');
  assert.deepEqual(la4774.end, { dateTime: '2026-10-31T16:50:00', timeZone: 'America/Maceio' });
  bySummary('AJU-BSB LA4775');
  const la3312 = bySummary('BSB-SLZ LA3312');
  assert.deepEqual(la3312.start, { dateTime: '2026-10-31T21:10:00', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(la3312.end, { dateTime: '2026-10-31T23:35:00', timeZone: 'America/Fortaleza' });
  for (const e of [pairing, la4774, la3312]) assert.ok(e.description.includes('A328'));
});

await check('Continuação 02/11 após a virada do mês', async () => {
  const pairing = bySummary('SLZ-GRU-BSB');
  assert.deepEqual(pairing.start, { dateTime: '2026-11-02T03:35:00', timeZone: 'America/Fortaleza' });
  assert.deepEqual(pairing.end, { dateTime: '2026-11-02T12:05:00', timeZone: 'America/Sao_Paulo' });
  const la3295 = bySummary('SLZ-GRU LA3295');
  assert.deepEqual([la3295.start.dateTime, la3295.end.dateTime], ['2026-11-02T04:10:00', '2026-11-02T07:55:00']);
  assert.ok(la3295.description.includes('Aircraft: A321'));
  const la3263 = bySummary('GRU-BSB LA3263');
  assert.deepEqual([la3263.start.dateTime, la3263.end.dateTime], ['2026-11-02T09:50:00', '2026-11-02T11:35:00']);
  assert.ok(la3263.description.includes('Aircraft: A328'));
});

await check('Upsert idempotente (2ª sync sem mudança = 0 criações, 0 exclusões)', async () => {
  assert.equal(first.created, first.total);
  assert.equal(first.deleted, 2, 'migra só o legado do mesmo mês e o legado de novembro em data coberta (02/11)');
  assert.equal(calendars.get('primary').events.has('legacynov1'), false);
  assert.deepEqual(calendars.get('primary').events.get('legacynov2'), legacyNovOther, 'legado de outro mês fora das datas cobertas fica intacto');
  const before = { ...ops };
  const second = await calendar.syncRosterToGoogleCalendar(buildRoster(), settings);
  assert.deepEqual({ created: second.created, updated: second.updated, deleted: second.deleted }, { created: 0, updated: 0, deleted: 0 });
  assert.equal(second.unchanged, second.total);
  assert.deepEqual([ops.POST - before.POST, ops.PATCH - before.PATCH, ops.DELETE - before.DELETE], [0, 0, 0]);
  const keys = crewcheckEvents().map((e) => e.extendedProperties.private.crewcheckEventKey);
  assert.equal(new Set(keys).size, keys.length, 'sem duplicatas');
  const patchedBefore = new Map(crewcheckEvents().map((e) => [e.id, JSON.stringify(e)]));
  const changed = await calendar.syncRosterToGoogleCalendar(buildRoster({ la3281Arrival: '13:25' }), settings);
  assert.deepEqual({ created: changed.created, updated: changed.updated, deleted: changed.deleted }, { created: 0, updated: 2, deleted: 0 }, 'PATCH só na etapa alterada e na jornada que a lista');
  const touched = crewcheckEvents().filter((e) => patchedBefore.get(e.id) !== JSON.stringify(e)).map((e) => e.summary).sort();
  assert.deepEqual(touched, ['BSB-VCP-BSB-OPS-BSB', 'VCP-BSB LA3281']);
  assert.equal(bySummary('VCP-BSB LA3281').end.dateTime, '2026-10-26T13:25:00');
  const dropped = await calendar.syncRosterToGoogleCalendar(buildRoster({ la3281Arrival: '13:25', dropDof: true }), settings);
  assert.deepEqual({ created: dropped.created, updated: dropped.updated, deleted: dropped.deleted }, { created: 0, updated: 0, deleted: 1 });
});

await check('Evento pessoal no mesmo período permanece intacto', async () => {
  assert.deepEqual(calendars.get('primary').events.get('personal1'), personal);
  assert.deepEqual(calendars.get('primary').events.get('othercrew1'), otherCrew, 'evento CrewCheck de outro tripulante intocado');
  assert.equal(calendars.get('primary').events.has('legacy1'), false);
});

await check('calendarId secundário válido ("Bruno & Marina")', async () => {
  const list = await calendar.listGoogleCalendars();
  const secondary = list.find((item) => item.summary === 'Bruno & Marina');
  assert.ok(secondary && secondary.id === BRUNO_MARINA && secondary.accessRole === 'owner');
  assert.ok(list.some((item) => item.id === 'primary'));
  assert.equal(list.some((item) => item.summary === 'Feriados'), false, 'somente calendários próprios');
  const saved = calendar.saveGoogleCalendarSettings({ ...settings, selectedCalendarId: BRUNO_MARINA, selectedCalendarName: 'Bruno & Marina' });
  assert.equal(saved.selectedCalendarId, BRUNO_MARINA);
  const result = await calendar.syncRosterToGoogleCalendar(buildRoster(), saved);
  assert.equal(result.calendarId, BRUNO_MARINA);
  assert.equal(result.created, result.total);
  bySummary('BSB-OPS LA3968', BRUNO_MARINA);
  await assert.rejects(() => calendar.syncRosterToGoogleCalendar(buildRoster(), { ...settings, selectedCalendarId: 'feriados@group.v.calendar.google.com' }), /proprietário|GOOGLE_CALENDAR_NOT_OWNED|403/);
  assert.equal(calendar.saveGoogleCalendarSettings({ ...settings, selectedCalendarId: '../../users/me/settings' }).selectedCalendarId, 'primary');
});

await check('Caminho arbitrário/malicioso bloqueado no proxy', async () => {
  const v = server.validateGoogleCalendarProxyRequest;
  const enc = encodeURIComponent(BRUNO_MARINA);
  for (const [p, m] of [
    ['/calendars/primary/events', 'GET'], ['/calendars/primary/events', 'POST'], ['/calendars/primary/events/abc123', 'PATCH'],
    ['/calendars/primary/events/abc123', 'DELETE'], [`/calendars/${enc}/events?privateExtendedProperty=crewcheck%3Dtrue&timeMin=2026-10-01T00%3A00%3A00Z`, 'GET'],
    ['/users/me/calendarList?minAccessRole=owner&showHidden=false', 'GET'], [`/users/me/calendarList/${enc}`, 'GET'],
  ]) assert.equal(v(p, m).ok, true, `deveria permitir ${m} ${p}`);
  for (const [p, m] of [
    ['/calendars/primary/acl', 'GET'], ['/users/me/settings', 'GET'], ['/calendars/primary', 'DELETE'], ['/calendars/primary/events/../../acl', 'GET'],
    ['/calendars/primary%2F..%2Facl/events', 'GET'], ['/calendars/a%2Fb/events', 'GET'], ['https://evil.example/calendars/primary/events', 'GET'],
    ['//evil.example/calendars/primary/events', 'GET'], ['/calendars/primary/events?foo=bar', 'GET'], ['/calendars/primary/events/abc123', 'POST'],
    ['/calendars/primary/events', 'DELETE'], ['/users/me/calendarList', 'POST'], ['/users/me/calendarList/primary%40x.com/extra', 'GET'],
    ['/calendars/primary/events/abc123/instances', 'GET'], ['/calendars/primary/events/quickAdd?text=x', 'POST'], ['/calendars/primary/events?q=x#frag', 'GET'],
    ['/calendars/evil@x.com/events', 'GET'], ['/calendars/primary/events\\..\\acl', 'GET'], ['/freeBusy', 'POST'],
  ]) assert.equal(v(p, m).ok, false, `deveria bloquear ${m} ${p}`);
  // Rota real do servidor: bloqueio acontece antes de qualquer token.
  const response = await callRoute('/api/google-calendar/oauth/proxy', 'POST', { path: '/calendars/primary/acl', method: 'GET' });
  assert.equal(response.status, 403);
  assert.equal(response.payload.code, 'GOOGLE_PATH_BLOCKED');
});

await check('OAuth no APK/WebView abre o navegador externo (callback HTTPS)', async () => {
  const opened = [];
  globalThis.CrewCheckNative = { openExternal: (url) => { opened.push(url); return true; } };
  localStorage.removeItem('crewcheck_google_calendar_server_bridge_v1');
  await calendar.connectGoogleCalendar();
  delete globalThis.CrewCheckNative;
  assert.equal(opened.length, 1);
  assert.ok(opened[0].startsWith('https://accounts.google.com/'));
  assert.deepEqual(windowOpenCalls, [], 'nenhuma janela dentro da WebView');
  assert.equal(globalThis.document, undefined, 'Google Identity Services não é carregado na WebView');
  const start = await callRoute('/api/google-calendar/oauth/start', 'POST', {});
  const auth = new URL(start.payload.authUrl);
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://crewcheck.online/api/google-calendar/oauth/callback');
  assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.calendarlist.readonly');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('access_type'), 'offline');
  const activity = fs.readFileSync(path.join(root, 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'), 'utf8');
  assert.match(activity, /if \(isCrewCheckWebUrl\(target\)\) return false;\s*openExternalUrl\(target\);/);
  assert.match(activity, /new Intent\(Intent\.ACTION_VIEW, uri\)/);
});

async function callRoute(pathname, method, body) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  const req = { method, headers: { 'content-type': 'application/json' }, [Symbol.asyncIterator]: async function* () { yield* chunks; }, on(event, handler) { if (event === 'data') chunks.forEach((c) => handler(c)); if (event === 'end') handler(); return this; } };
  const res = { status: 0, body: '', writeHead(status) { this.status = status; return this; }, setHeader() {}, end(value) { this.body = String(value || ''); } };
  const previous = process.cwd();
  process.chdir(scratch);
  try { await server.handleGoogleCalendarOAuthRoute(req, res, new URL(`https://crewcheck.online${pathname}`), { identity: { sub: 'regression-user' }, authRequired: true }); }
  finally { process.chdir(previous); }
  return { status: res.status, payload: JSON.parse(res.body || '{}') };
}

fs.rmSync(scratch, { recursive: true, force: true });
assert.equal(results.length, 13);
console.log(`Calendar Operational Detailed: ${results.length}/13 cenários OK.`);
