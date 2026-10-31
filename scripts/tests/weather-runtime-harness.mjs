import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../../shared/operational-weather-pulse.mjs';
import * as observationPolicy from '../../server/weather/critical-observation.mjs';
import * as sourceTime from '../../shared/weather-observation-source-time.mjs';
import { formatWeatherNoticeDetails } from '../../shared/weatherNoticeDetails.mjs';
import { loadWeatherTs, readWeatherSource, weatherFunction } from './weather-test-loader.mjs';
export const WEATHER_NOW = Date.parse('2032-02-02T17:30:00Z');
export const WEATHER_EVENT = { id: 'synthetic-flight', kind: 'flight', flightNumber: 'TEST1', origin: 'GRU', destination: 'GRU',
  canonical: { kind: 'flight', startDateTime: '2032-02-02T18:00:00Z', endDateTime: '2032-02-02T19:00:00Z', journeyId: 'synthetic-journey',
    leg: { departureTime: '18:00', arrivalTime: '19:00' } } };
export const WEATHER_STATION = { icao: 'SBGR', metar: 'METAR SBGR 021730Z 02015G30KT 9000 -RA BKN042', taf: 'TAF SBGR synthetic',
  available: { metar: true }, official: { metar: true }, provider: { metar: 'aviationweather' },
  observationTimeSource: { metar: { field: 'obsTime', value: WEATHER_NOW / 1000 } },
  monitoring: { severity: 2, hazards: [] }, observedAt: { metar: '2032-02-02T17:30:00Z' } };
const storage = () => { const data = new Map(); return { data, getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }; };
export function weatherRuntimeHarness({ native = false, permission = 'granted', device = true, pulse = true, weather = true,
  hidden = true, formatter = formatWeatherNoticeDetails } = {}) {
  let now = WEATHER_NOW, timerId = 0, activeFormatter = formatter, currentPayload = { stations: { SBGR: structuredClone(WEATHER_STATION) } }, response;
  const localStorage = storage(), sessionStorage = storage(), window = new EventTarget(), tasks = [], timers = new Map();
  const sent = [], notices = [], pulseOnly = [], sounds = [], fetches = [], geolocation = [], permissions = [];
  window.setTimeout = (callback, delay = 0) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.setInterval = () => { throw Error('No weather polling interval allowed'); }; window.clearInterval = () => {};
  if (native) window.CrewCheckNative = { permissionStatus: () => JSON.stringify({ notifications: permission === 'granted' }),
    notify: (title, body) => { sent.push({ title, body, channel: 'native' }); return true; }, requestNotifications: () => permissions.push('native') };
  class Notification { static permission = permission; static requestPermission() { permissions.push('browser'); return Promise.resolve(permission); }
    constructor(title, options) { sent.push({ title, ...options, channel: 'browser' }); } }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const document = { visibilityState: hidden ? 'hidden' : 'visible' };
  const globals = { localStorage, sessionStorage, window, document, Notification, Date: Clock, Event, CustomEvent, AbortController,
    queueMicrotask: callback => tasks.push(callback), crypto: { randomUUID: () => 'synthetic-choice' },
    navigator: { geolocation: { getCurrentPosition: () => geolocation.push('called') } },
    fetch: (url, options) => { assert.match(url, /^\/api\/aviation-weather\?/); fetches.push({ url, options });
      return response || Promise.resolve({ ok: true, json: async () => currentPayload }); },
  };
  localStorage.setItem('crewcheck_auth_token', 'synthetic-only'); localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-owner' }));
  localStorage.setItem('crewcheck_device_notifications', device ? '1' : '0'); localStorage.setItem('crewcheck_weather_hourly', weather ? '1' : '0');
  const review = loadWeatherTs('client/src/lib/alertReviewStore.ts', {}, globals);
  const session = loadWeatherTs('client/src/components/pulse/pulseSession.ts', {}, globals);
  const runtime = loadWeatherTs('client/src/components/pulse/pulseRuntime.ts', {
    '@/lib/notificationPreferences': { readAccountNotificationSetting: (_key, fallback) => pulse ? '1' : '0' },
    './pulseSound': { playCrewCheckNoticeSound: key => sounds.push(key), stopCrewCheckNotificationSound() {} },
    './pulseSession': session, '../../lib/alertReviewStore': review,
  }, globals);
  const startup = loadWeatherTs('client/src/lib/rosterStartup.ts', {
    './authClient': { getToken: () => localStorage.getItem('crewcheck_auth_token'), getStoredUser: () => JSON.parse(localStorage.getItem('crewcheck_auth_user')),
      authFetch: () => { throw Error('No roster request permitted'); } }, '@shared/rosterStartup.mjs': { newestImports: rows => rows },
  }, globals);
  const ownership = loadWeatherTs('client/src/lib/alertRosterOwnership.ts', { './rosterStartup': startup, './alertReviewStore': review }, globals);
  const contextModule = loadWeatherTs('client/src/lib/operationalWeatherContext.ts', { './rosterStartup': startup, './alertReviewStore': review, './alertRosterOwnership': ownership }, globals);
  const noticeModule = loadWeatherTs('client/src/lib/operationalWeatherNotices.ts', {
    './alertReviewStore': review, '../components/pulse/pulseRuntime': { ...runtime,
      publishCrewCheckNotice: message => { notices.push(message); return runtime.publishCrewCheckNotice(message); },
      publishCrewCheckPulse: message => { pulseOnly.push(message); return runtime.publishCrewCheckPulse(message); } },
    '../../../shared/operational-weather-pulse.mjs': policy, '../../../server/weather/critical-observation.mjs': observationPolicy,
    '../../../shared/weatherNoticeDetails.mjs': { formatWeatherNoticeDetails: value => activeFormatter(value) },
  }, globals);
  const controllerModule = loadWeatherTs('client/src/lib/operationalWeatherController.ts', {
    './alertReviewStore': review, './operationalWeatherNotices': noticeModule,
    '../../../shared/operational-weather-pulse.mjs': policy, '../../../shared/weather-observation-source-time.mjs': sourceTime,
  }, globals);
  const home = readWeatherSource('client/src/pages/Home.tsx'), slots = [], effects = []; let index = 0;
  const equal = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  const scope = vm.createContext({ ...globals, ...contextModule, ...controllerModule, ...review, ...noticeModule,
    reconcileCrewCheckPulse: runtime.reconcileCrewCheckPulse, publishCrewCheckNotice: runtime.publishCrewCheckNotice,
    formatWeatherNoticeDetails, airportIcao: () => 'SBGR',
    readAccountNotificationSetting: () => undefined, isFinancialSetting: () => false, readFinancialSetting: () => '', writeFinancialSetting: () => true,
    useMemo(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useRef(value) { const i = index++; if (!slots[i]) slots[i] = { current: value }; return slots[i]; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || !equal(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  });
  const storageStart = home.indexOf('const storage = {'), storageEnd = home.indexOf('\n};', storageStart);
  const storageSource = home.slice(storageStart, storageEnd + 3);
  const functions = ['notifyCrewCheck', 'useWeatherLandingMonitor', 'useOperationalWeatherPulse'].map(name => weatherFunction(home, name)).join('\n');
  vm.runInContext(ts.transpileModule(`${storageSource}\nglobalThis.homeStorage=storage;\n${functions}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
  let bundle = { source: 'Synthetic.pdf', roster: { year: 2032, month: 2, days: [{ date: '02/02/2032', legs: [{ flightNumber: 'TEST1' }] }] } };
  let events = [structuredClone(WEATHER_EVENT)];
  localStorage.setItem(startup.startupKey(), JSON.stringify({ owner: startup.startupOwner(), selection: 'explicit', roster: bundle.roster, sourceFileName: bundle.source }));
  const render = () => { index = 0; scope.useWeatherLandingMonitor(); scope.useOperationalWeatherPulse(bundle, events); while (effects.length) effects.shift()(); };
  const cleanup = () => { for (const slot of slots) slot?.cleanup?.(); slots.length = 0; };
  const flush = async () => { for (let round = 0; round < 30; round++) { while (tasks.length) tasks.shift()(); for (let i = 0; i < 8; i++) await Promise.resolve(); if (!tasks.length) return; } throw Error('Unbounded microtask loop'); };
  return { runtime, review, startup, noticeModule, controllerModule, context: scope, localStorage, window, document, sent, notices, pulseOnly, sounds, fetches, geolocation, permissions,
    start: render, cleanup, flush, get bundle() { return bundle; }, get events() { return events; },
    setPayload(value) { currentPayload = value; }, setResponse(value) { response = value; }, setFormatter(value) { activeFormatter = value; },
    preference(enabled) { scope.homeStorage.set('crewcheck_weather_hourly', enabled ? '1' : '0'); },
    focus() { window.dispatchEvent(new Event('focus')); },
    remount() { cleanup(); render(); },
    time(value) { now = value; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    replace(nextBundle, nextEvents = events) { bundle = nextBundle; events = nextEvents; render(); },
  };
}
