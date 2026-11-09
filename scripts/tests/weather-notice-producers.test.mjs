import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { formatWeatherNoticeDetails } from '../../shared/weatherNoticeDetails.mjs';

// Real Home producer functions and real Pulse/session/review modules. Only I/O,
// React effect scheduling, preference lookup and sound are synthetic boundaries.
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const home = read('client/src/pages/Home.tsx');
function fn(name) {
  const start = home.indexOf(`function ${name}(`), end = home.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, name);
  return home.slice(start, end + 2);
}
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const NOW = Date.parse('2026-10-22T10:10:00Z');
const event = { id: 'synthetic-flight', kind: 'flight', flightNumber: 'TEST1', origin: 'GRU', destination: 'GRU', canonical: { startDateTime: '2026-10-22T12:00:00Z', journeyId: 'synthetic-journey' } };
const station = { icao: 'SBGR', metar: 'METAR SBGR 221000Z 02015G30KT 9000 -RA BKN042', taf: 'TAF SBGR 220900Z 2212/2312 9999', monitoring: { severity: 2, hazards: [] }, observedAt: { metar: '2026-10-22T10:00:00Z' } };
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function harness({ native = false, permission = 'granted', device = true, pulse = true, weather = true, hidden = true, formatter = formatWeatherNoticeDetails } = {}) {
  const localStorage = storage(), sessionStorage = storage(), listeners = new Map(), intervals = new Map(), cleanups = [], sent = [], publications = [], fetches = [];
  localStorage.setItem('crewcheck_auth_token', 'synthetic-only');
  localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-owner' }));
  localStorage.setItem('crewcheck_device_notifications', device ? '1' : '0');
  localStorage.setItem('crewcheck_weather_hourly', weather ? '1' : '0');
  const window = {
    addEventListener(name, listener) { listeners.set(name, [...listeners.get(name) || [], listener]); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
    setTimeout: () => 1, clearTimeout() {},
    setInterval(fn) { const id = intervals.size + 1; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    ...(native ? { CrewCheckNative: { permissionStatus: () => JSON.stringify({ notifications: permission === 'granted' }), notify: (title, body) => { sent.push({ title, body, channel: 'native' }); return true; } } } : {}),
  };
  class Notification { static permission = permission; constructor(title, options) { sent.push({ title, ...options, channel: 'browser' }); } }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  let payload = { stations: { GRU: structuredClone(station) } }, response;
  const context = vm.createContext({ window, document: { visibilityState: hidden ? 'hidden' : 'visible' }, localStorage, sessionStorage, Notification, Date: Clock, console,
    Event: class { constructor(type) { this.type = type; } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  });
  const modules = {};
  function module(name, file) {
    const exports = {};
    context.exports = exports;
    context.require = request => {
      if (request.includes('pulseSound')) return { playCrewCheckNoticeSound() {}, stopCrewCheckNotificationSound() {} };
      if (request.includes('notificationPreferences')) return { readAccountNotificationSetting: (_key, fallback) => pulse ? '1' : fallback };
      const key = request.split('/').pop();
      assert.ok(modules[key], `unexpected dependency ${request}`);
      return modules[key];
    };
    vm.runInContext(compile(read(file)), context, { filename: file });
    modules[name] = exports;
    return exports;
  }
  const review = module('alertReviewStore', 'client/src/lib/alertReviewStore.ts');
  module('pulseSession', 'client/src/components/pulse/pulseSession.ts');
  const runtime = module('pulseRuntime', 'client/src/components/pulse/pulseRuntime.ts');
  Object.assign(context, {
    storage: { get: (key, fallback) => localStorage.getItem(key) ?? fallback, set: (key, value) => localStorage.setItem(key, value) },
    useEffect: callback => { cleanups.push(callback()); },
    navigator: { geolocation: { getCurrentPosition() {} } },
    airportIcao: airport => airport === 'GRU' ? 'SBGR' : 'SBFL',
    weatherLooksWorse: () => true, // Existing classifier is not part of this copy change.
    formatWeatherNoticeDetails: formatter,
    alertDigest: review.alertDigest,
    publishCrewCheckNotice: message => { publications.push(message); return runtime.publishCrewCheckNotice(message); },
    fetch: async (url, options) => { fetches.push({ url, options }); assert.match(url, /^\/api\/aviation-weather\?/); if (response) return response; return { json: async () => payload }; },
  });
  vm.runInContext(compile([fn('notifyCrewCheck'), fn('useWeatherLandingMonitor'), fn('useOperationalWeatherPulse')].join('\n')), context);
  return { context, runtime, review, sent, publications, localStorage, fetches, window,
    setPayload: value => { payload = value; }, setResponse: value => { response = value; },
    start: () => context.useOperationalWeatherPulse(event), landing: () => context.useWeatherLandingMonitor(event),
    cleanup: () => { for (const cleanup of cleanups) cleanup?.(); },
    tick: async () => { for (const callback of intervals.values()) callback(); await flush(); },
  };
}
for (const native of [false, true]) test(`real Home -> Pulse + fake ${native ? 'native' : 'browser'} sink carries current facts`, async () => {
  const h = harness({ native }); h.start(); await flush();
  assert.equal(h.publications.length, 1); assert.equal(h.sent.length, 1);
  const detail = formatWeatherNoticeDetails({ raw: station.metar, observedAt: station.observedAt.metar, station: 'SBGR' });
  assert.equal(h.publications[0].detail, detail); assert.equal(h.sent[0].body, detail);
  assert.equal(h.runtime.currentCrewCheckPulseState().message.detail, detail);
  assert.equal(h.publications[0].action.label, 'Ver meteorologia');
  assert.equal(h.publications[0].action.view, 'weather');
  await h.tick(); assert.equal(h.publications.length, 1); assert.equal(h.sent.length, 1);
  h.cleanup();
});
test('raw landing producer uses observed facts without guessing a full date and preserves identity/action', () => {
  const h = harness();
  h.localStorage.setItem('crewcheck_latest_weather_report_GRU', station.metar);
  h.localStorage.setItem(`crewcheck_weather_signature_GRU_${event.id}`, 'previous-synthetic-signature');
  h.landing();
  assert.equal(h.publications.length, 1); assert.match(h.sent[0].body, /rajadas 30 kt.*METAR dia 22 10:00 UTC$/);
  const legacyBody = 'GRU: novo METAR com atenção operacional até o pouso.';
  const key = `local:Meteorologia mudou:${legacyBody}`;
  assert.equal(h.publications[0].dedupeKey, key);
  assert.equal(h.publications[0].review.version, h.review.alertDigest([key, legacyBody]));
  assert.equal(h.publications[0].action.label, 'Ver tempo');
  h.cleanup();
});
test('display-only changes preserve the exact pre-patch review identity and prior dismissal', async () => {
  const h = harness({ formatter: () => 'Different display language, same evidence' });
  const signature = [2, station.metar, station.taf, ''].join('|');
  const key = `weather:${event.id}:GRU:${signature}`;
  const identity = { occurrence: h.review.alertDigest(['notice', key]), version: h.review.alertDigest([key, 'TEST1 · METAR/TAF com critério operacional relevante.']) };
  assert.equal(h.review.saveAlertReview({ ...identity, state: 'dismissed', title: 'old copy' }, h.review.alertAccount()), true);
  h.start(); await flush();
  assert.equal(h.publications[0].review.occurrence, identity.occurrence);
  assert.equal(h.publications[0].review.version, identity.version);
  assert.equal(h.sent.length, 0); assert.equal(h.runtime.currentCrewCheckPulseState().message, null);
  h.cleanup();
});
test('same raw METAR with metadata-only changes does not publish; TAF-only signature policy is untouched', async () => {
  const h = harness(); h.start(); await flush();
  h.setPayload({ stations: { GRU: { ...station, source: { metar: 'Changed metadata' }, observedAt: { metar: '2026-10-22T10:01:00Z' } } } });
  await h.tick(); assert.equal(h.publications.length, 1);
  h.setPayload({ stations: { GRU: { ...station, taf: station.taf + ' TEMPO TSRA' } } });
  await h.tick(); assert.equal(h.publications.length, 2, 'known main signature issue remains owned by #1031');
  assert.equal(h.publications[1].detail, h.publications[0].detail);
  assert.equal(h.sent.length, 1, 'existing system-notification cooldown remains unchanged');
  h.cleanup();
});
test('existing effect cleanup blocks a delayed response, including occurrence replacement', async () => {
  const h = harness(); let release;
  h.setResponse(new Promise(resolve => { release = resolve; })); h.start(); h.cleanup();
  release({ json: async () => ({ stations: { GRU: station } }) }); await flush();
  assert.equal(h.publications.length, 0); assert.equal(h.sent.length, 0);
});
test('existing auth events clear the real Pulse queue without modifying another owner review', async () => {
  const h = harness(); h.start(); await flush();
  assert.ok(h.runtime.currentCrewCheckPulseState().message);
  h.window.dispatchEvent({ type: 'crewcheck:auth-will-change' });
  h.localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-other-owner' }));
  h.window.dispatchEvent({ type: 'crewcheck:auth-changed' });
  assert.equal(h.runtime.currentCrewCheckPulseState().message, null);
  assert.equal(h.review.readAlertReviews().length, 0);
  h.cleanup();
});
for (const options of [{ permission: 'denied' }, { device: false }, { hidden: false }]) test(`existing device admission stays unchanged: ${JSON.stringify(options)}`, async () => {
  const h = harness(options); h.start(); await flush();
  assert.equal(h.publications.length, 1); assert.equal(h.sent.length, 0); h.cleanup();
});
test('hourly preference OFF does not fetch or publish', async () => {
  const h = harness({ weather: false }); h.start(); await flush();
  assert.equal(h.fetches.length, 0); assert.equal(h.publications.length, 0); assert.equal(h.sent.length, 0);
});
