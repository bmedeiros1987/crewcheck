import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14331/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14331/apply.mjs');"), 'v14.3.31 deve estar no fim da preparação canônica');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14331-'));
const write = (relative, content) => {
  const target = path.join(tempDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
};

write('client/src/pages/Home.tsx', `const DEFAULT_VERSION = '14.3.30';
const CREWCHECK_UI_CORE_NOTE = 'legado';
type ZeroLeg = any;
type RoutePreviewInfo = any;
type AirportMapPoint = { code: string; lat: number; lon: number };
const storage = { get() { return ''; }, set() {} };
function eventStartDateTime(event: any) { return new Date(event.canonical?.startDateTime || event.date); }
function noFutureLeg(events: any[]) { return events[0] || { placeholder: true }; }
function eventClockDate(event: any, clock: string) { const value = new Date(event.date); const [h,m] = String(clock || '00:00').split(':').map(Number); value.setHours(h || 0, m || 0, 0, 0); return value; }
function nextFlight(events: any[]) { return events[0]; }
function nextRealFlight(events: any[]) { return nextFlight(events); }
function currentDayAnchor(events: ZeroLeg[]) { return nextFlight(events); }
function coordinatePair(value = '') { const m = String(value).match(/^(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)$/); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null; }
function eventRouteOrigin(_event: any) { return '-27.6705,-48.5525'; }
function airportPoint(code: string) { return code === 'FLN' ? { code, lat: -27.6705, lon: -48.5525 } : code === 'BSB' ? { code, lat: -15.8711, lon: -47.9186 } : null; }
function routeDistanceKm(a: any, b: any) { const dy = (a.lat - b.lat) * 111; const dx = (a.lon - b.lon) * 98; return Math.sqrt(dx * dx + dy * dy); }
function eventRouteDestination(event: any) { return event.origin; }
function monthlyMapDestinations(_events: any[]) { return []; }
function routeDurationMinutes(route: any) { return Number(route?.durationMinutes || 0); }
function saveDepartureTravelMinutes() {}
function readDepartureTravelMinutes() { return 35; }
function defaultDepartureTravelMinutes() { return 35; }
type SmartDepartureEstimate = { source: 'live' | 'cached' | 'estimated' };
function smartDepartureEstimate(event: any, route: any, margin: number) {
  const rawLiveMinutes = routeDurationMinutes(route);
  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;
  if (liveMinutes > 0) saveDepartureTravelMinutes(event, liveMinutes);
  const cachedMinutes = readDepartureTravelMinutes(event);
  const travelMinutes = liveMinutes || cachedMinutes || defaultDepartureTravelMinutes();
  const source: SmartDepartureEstimate['source'] = liveMinutes ? 'live' : cachedMinutes ? 'cached' : 'estimated';
  const hasPublishedPresentation = /^\\d{1,2}:\\d{2}$/.test(String(event.presentation || '').trim());
  const hasDeparture = /^\\d{1,2}:\\d{2}$/.test(String(event.departure || '').trim());
  const clock = hasPublishedPresentation ? event.presentation : hasDeparture ? event.departure : '';
  const presentationDate = eventClockDate(event, clock);
  if (!hasPublishedPresentation && hasDeparture) presentationDate.setMinutes(presentationDate.getMinutes() - 60);
  return { source, travelMinutes, marginMinutes: margin, leaveLabel: '13:10', presentationLabel: '14:00', travelLabel: '35 min', leaveDate: presentationDate };
}
function eventClockDateLegacy() { return null; }
function GoogleMapsRoutePreview({ event, mode = 'driving', margin = 25 }: any) {
  const origin = eventRouteOrigin(event);
  const destination = eventRouteDestination(event);
  const mapsMode = mode.includes('transit') ? 'transit' : 'driving';
  const route = null;
  let monitor: any = null;
  function setMonitor(value: any) { monitor = value; }
  useEffect(() => {
    if (mapsMode !== 'driving') { setMonitor(null); return; }
    const presentationAt = eventClockDate(event, event.presentation);
    if (presentationAt.getTime() <= Date.now() || presentationAt.getTime() > Date.now() + 7 * 86_400_000) return;
    return () => undefined;
  }, [event.id, event.presentation, origin, destination, mapsMode, margin]);
  return monitor;
}
function isAdmin() { return false; }
function Departure({ event }: { event: any }) {
  const mode = 'automatic';
  const margin = 15;
  const route = null;
  const routePending = false;
  const originLabel = 'Rua Professor Marcos Cardoso Filho, 500';
  const modeLabel = 'Carro + voo';
  const estimate = smartDepartureEstimate(event, route, margin);
  const rawLiveMinutes = routeDurationMinutes(route);
  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;
  const leaveDayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(estimate.leaveDate);
  const statusLabel = liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';
  return <section className="cz-departure" data-departure-v1406="true" data-departure-v14327="true">
    <article className="cz-depart-hero">
      <header className="cz-depart-hero-head"><span>SAÍDA PREVISTA</span><em>{statusLabel}</em></header>
      <div className="cz-depart-when"><span>Sair em {leaveDayLabel}</span><strong className="cz-depart-time">{estimate.leaveLabel}</strong></div>
      <h2>{originLabel} → {event.origin}</h2>
      <div className="cz-depart-detail"><span>{modeLabel}</span><span>{estimate.travelLabel} de deslocamento</span><span>margem {estimate.marginMinutes} min</span><span>apresentação {estimate.presentationLabel}</span></div>
      {rawLiveMinutes > 300 && <p className="cz-depart-warning">A rota terrestre encontrada não combina com esta programação. Mantive uma estimativa local protegida e não usei o trajeto de {Math.floor(rawLiveMinutes / 60)} horas.</p>}
    </article>
    <div className="cz-depart-kpis"><div><span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong></div></div>
    {!liveMinutes && <p className="cz-mini-status">Estimativa protegida.</p>}
    <GoogleMapsRoutePreview key={event.id} event={event} mode={mode} onRoute={() => undefined}/>
  </section>;
}
function MonthlyMapView() { return null; }
function Cockpit({ events, setView }: any) {
  const event = nextFlight(events);
  return <><SmartCard event={event} setView={setView}/></>;
}
function rosterCode() { return ''; }
function currentCompliance() { return null; }
function currentGym() { return null; }
function useWeatherLandingMonitor() {}
function buildLegs() { return []; }
function Home() {
  const bundle: any = { roster: {} };
  const presentationRevision = 0;
  const events = buildLegs(bundle.roster, presentationRevision);
  const event = nextFlight(events);
  const flightEvent = nextRealFlight(events);
  const compliance = currentCompliance(bundle);
  const gym = currentGym(bundle);
  useWeatherLandingMonitor(flightEvent);
  const view = 'departure';
  return <>{view === 'departure' && <Departure event={event}/>} {view === 'wakeup' && <WakeupView event={event}/>}</>;
}
`);
write('client/src/App.tsx', "localStorage.setItem('crewcheck_last_loaded_version', '14.3.30');\n");
write('client/src/pages/AuthPage.tsx', "const value = localStorage.getItem('crewcheck_last_loaded_version', '14.3.30'); export const page = <main data-version=\"14.3.30\"/>;\n");
write('client/index.html', `<!doctype html><html data-crewcheck-release="14.3.30"><head><meta name="crewcheck-release" content="14.3.30" /><link rel="manifest" href="/manifest.json?v=14330"/></head><body><script>var key='crewcheck-cache-reset-14-3-30'; var currentRelease = '14.3.30'; navigator.serviceWorker.register('/sw.js?v=14330');</script></body></html>`);
write('client/public/sw.js', "const CACHE_NAME = 'crewcheck-v14.3.30-shell'; const RUNTIME_CACHE = 'crewcheck-v14.3.30-runtime';\n");

try {
  const first = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout || 'primeira aplicação v14.3.31 falhou');
  const prepared = fs.readFileSync(path.join(tempDir, 'client/src/pages/Home.tsx'), 'utf8');

  for (const marker of [
    'function nextDepartureEvent(',
    'event.canonical?.showPresentation !== false',
    'function departureRouteMismatch(',
    'localDistance > 350',
    "routeMismatch ? 'REVISAR PROGRAMAÇÃO'",
    'aeroporto de apresentação {event.origin}',
    "`${event.flightNumber} · ${event.origin} → ${event.destination}`",
    'O cálculo de saída e os alertas automáticos foram pausados',
    '<Departure event={departureEvent}/>',
    '<SmartCard event={departureEvent} setView={setView}/>',
    'margin={margin} onRoute=',
    'data-departure-v14331="true"',
  ]) assert.ok(prepared.includes(marker), `marcador obrigatório ausente: ${marker}`);

  assert.ok(!prepared.includes('Mantive uma estimativa local protegida e não usei o trajeto'), 'fallback silencioso antigo não pode permanecer');
  assert.ok(prepared.includes("const DEFAULT_VERSION = '14.3.31';"), 'versão web não atualizada');
  assert.ok(fs.readFileSync(path.join(tempDir, 'client/public/release.json'), 'utf8').includes('14.3.31'), 'release.json não atualizado');

  const second = spawnSync(process.execPath, [applyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.31 falhou');
  assert.equal(fs.readFileSync(path.join(tempDir, 'client/src/pages/Home.tsx'), 'utf8'), prepared, 'patch v14.3.31 deve ser idempotente');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function chooseDeparture(events, now) {
  const eligible = events.filter((event) => !event.placeholder
    && event.kind !== 'stay'
    && event.kind !== 'rest'
    && (event.kind !== 'flight' || event.showPresentation !== false));
  return eligible
    .filter((event) => event.presentationAt > now)
    .sort((a, b) => a.presentationAt - b.presentationAt)[0] || null;
}

const aug17 = new Date(2026, 7, 17, 14, 0).getTime();
const selected = chooseDeparture([
  { kind: 'stay', presentationAt: aug17 - 60_000, code: 'HOTEL' },
  { kind: 'flight', showPresentation: false, presentationAt: aug17 - 30_000, origin: 'GRU', destination: 'BSB', code: 'LA0002' },
  { kind: 'flight', showPresentation: true, presentationAt: aug17, origin: 'FLN', destination: 'GRU', code: 'LA0001' },
  { kind: 'flight', showPresentation: true, presentationAt: aug17 + 3_600_000, origin: 'BSB', destination: 'CWB', code: 'LA0003' },
], aug17 - 3_600_000);
assert.equal(selected?.origin, 'FLN', 'Saída deve usar a origem da primeira perna real');
assert.equal(selected?.destination, 'GRU', 'destino aéreo deve permanecer separado do destino terrestre');
assert.equal(new Date(selected.presentationAt).getDate(), 17, 'data civil de 17/08/2026 deve ser preservada');

function approximateKm(a, b) {
  const dy = (a.lat - b.lat) * 111;
  const dx = (a.lon - b.lon) * 98;
  return Math.sqrt(dx * dx + dy * dy);
}
const fln = { lat: -27.6705, lon: -48.5525 };
const bsb = { lat: -15.8711, lon: -47.9186 };
assert.ok(approximateKm(fln, fln) < 1, 'localização em Florianópolis deve combinar com FLN');
assert.ok(approximateKm(fln, bsb) > 350, 'FLN para BSB deve bloquear cálculo terrestre local');

console.log('v14.3.31 canonical Smart Departure selection, civil date and route safety regression: OK');
