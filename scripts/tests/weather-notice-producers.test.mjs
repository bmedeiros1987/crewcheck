import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWeatherNoticeDetails } from '../../shared/weatherNoticeDetails.mjs';
import { weatherRuntimeHarness as harness, WEATHER_EVENT as event, WEATHER_STATION as station, WEATHER_NOW as NOW } from './weather-runtime-harness.mjs';

// Actual raw/prepared Home hooks -> actual context/controller/notices -> actual
// Pulse/session/review code. Only I/O, React scheduling and devices are synthetic.
for (const native of [false, true]) test(`real Home -> Pulse + fake ${native ? 'native' : 'browser'} sink carries current facts`, async () => {
  const h = harness({ native }); h.start(); await h.flush();
  assert.equal(h.notices.length, 1); assert.equal(h.sent.length, 1);
  const detail = formatWeatherNoticeDetails({ raw: station.metar, observedAt: station.observedAt.metar, station: 'SBGR' });
  assert.equal(h.notices[0].detail, detail); assert.equal(h.sent[0].body, detail);
  assert.equal(h.runtime.currentCrewCheckPulseState().message.detail, detail);
  assert.equal(h.notices[0].action.label, 'Ver meteorologia'); assert.equal(h.notices[0].action.view, 'weather');
  assert.equal(h.notices[0].action.context.programId, event.id); assert.equal(h.notices[0].action.context.journeyId, event.canonical.journeyId);
  h.focus(); await h.flush(); assert.equal(h.notices.length, 1); assert.equal(h.sent.length, 1);
  assert.equal(h.geolocation.length, 0); assert.equal(h.permissions.length, 0); h.cleanup();
});
test('legacy raw landing cache remains dormant and cannot claim fresh official provenance', async () => {
  const h = harness({ weather: false });
  h.localStorage.setItem('crewcheck_latest_weather_report_GRU', station.metar);
  h.localStorage.setItem(`crewcheck_weather_signature_GRU_${event.id}`, 'previous-synthetic-signature');
  h.start(); await h.flush();
  assert.equal(h.notices.length, 0); assert.equal(h.sent.length, 0); assert.equal(h.fetches.length, 0);
  assert.equal(h.geolocation.length, 0); assert.equal(h.permissions.length, 0); h.cleanup();
});
test('display-only changes honor exact owner/time-proven legacy dismissal without migrating review', async () => {
  const h = harness({ formatter: () => 'Different display language, same evidence' });
  const signature = [2, station.metar, station.taf, ''].join('|'), key = `weather:${event.id}:GRU:${signature}`;
  const identity = { occurrence: h.review.alertDigest(['notice', key]), version: h.review.alertDigest([key, 'TEST1 · METAR/TAF com critério operacional relevante.']) };
  assert.equal(h.review.saveAlertReview({ ...identity, state: 'dismissed', title: 'old copy' }, h.review.alertAccount()), true);
  const before = JSON.stringify(h.review.readAlertReviews()); h.start(); await h.flush();
  assert.equal(h.notices.length, 0); assert.equal(h.sent.length, 0); assert.equal(h.runtime.currentCrewCheckPulseState().message, null);
  assert.equal(JSON.stringify(h.review.readAlertReviews()), before); h.cleanup();
});
test('same METAR with provider/TAF/legacy-format metadata changes upserts one pending fact without OS/sound retry', async () => {
  const h = harness(); h.start(); await h.flush(); const original = h.runtime.currentCrewCheckPulseState().message;
  h.setPayload({ stations: { SBGR: { ...station, taf: station.taf + ' TEMPO TSRA', source: { metar: 'Changed metadata' },
    provider: { metar: 'redemet' }, observationTimeSource: { metar: { field: 'validade_inicial', value: '2032-02-02 17:30:00' } },
    observedAt: { metar: '2032-02-02T17:31:00Z' } } } });
  h.time(NOW + 60 * 60_000); await h.flush();
  assert.equal(h.fetches.length, 2); assert.equal(h.notices.length, 1); assert.equal(h.sent.length, 1); assert.equal(h.sounds.length, 1);
  const current = h.runtime.currentCrewCheckPulseState(); assert.equal(current.queued, 0);
  assert.equal(current.message.id, original.id); assert.deepEqual(current.message.review, original.review); assert.equal(current.message.detail, original.detail);
  h.cleanup();
});
test('Home cleanup blocks a delayed response and leaves a real abort tombstone until acknowledgement', async () => {
  const h = harness(); let release;
  h.setResponse(new Promise(resolve => { release = resolve; })); h.start(); await h.flush(); h.cleanup();
  assert.equal(h.fetches[0].options.signal.aborted, true);
  release({ ok: true, json: async () => ({ stations: { SBGR: station } }) }); await h.flush();
  assert.equal(h.notices.length, 0); assert.equal(h.sent.length, 0);
});
test('existing auth events clear real Pulse without modifying another owner review', async () => {
  const h = harness(); h.start(); await h.flush(); assert.ok(h.runtime.currentCrewCheckPulseState().message);
  h.window.dispatchEvent(new Event('crewcheck:auth-will-change'));
  h.localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-other-owner' }));
  h.window.dispatchEvent(new Event('crewcheck:auth-changed')); await h.flush();
  assert.equal(h.runtime.currentCrewCheckPulseState().message, null); assert.equal(h.review.readAlertReviews().length, 0); h.cleanup();
});
for (const options of [{ permission: 'denied' }, { device: false }, { hidden: false }]) test(`existing device admission stays unchanged: ${JSON.stringify(options)}`, async () => {
  const h = harness(options); h.start(); await h.flush(); assert.equal(h.notices.length, 1); assert.equal(h.sent.length, 0); assert.equal(h.permissions.length, 0); h.cleanup();
});
test('Pulse OFF does not silently turn off an already permitted background OS channel', async () => {
  const h = harness({ pulse: false }); h.start(); await h.flush();
  assert.equal(h.sent.length, 1); assert.equal(h.runtime.currentCrewCheckPulseState().message, null); h.cleanup();
});
test('hourly preference OFF does not fetch or publish', async () => {
  const h = harness({ weather: false }); h.start(); await h.flush();
  assert.equal(h.fetches.length, 0); assert.equal(h.notices.length, 0); assert.equal(h.sent.length, 0); h.cleanup();
});
test('actual same-tab storage preference signal withdraws weather synchronously without marking reviewed', async () => {
  const h = harness(); h.start(); await h.flush(); assert.ok(h.runtime.currentCrewCheckPulseState().message);
  h.preference(false); assert.equal(h.runtime.currentCrewCheckPulseState().message, null); assert.equal(h.review.readAlertReviews().length, 0);
  h.preference(true); await h.flush(); assert.equal(h.fetches.length, 1); h.cleanup();
});
test('foreground first attempt remains Pulse-only after background resume and remount', async () => {
  const h = harness({ hidden: false }); h.start(); await h.flush(); assert.equal(h.sent.length, 0); assert.equal(h.notices.length, 1);
  h.document.visibilityState = 'hidden'; h.focus(); await h.flush(); h.remount(); await h.flush();
  assert.equal(h.sent.length, 0); assert.equal(h.notices.length, 1); assert.equal(h.fetches.length, 1);
  assert.ok(h.runtime.currentCrewCheckPulseState().message); h.cleanup();
});
test('weather expiry preserves SOS and unrelated queues and writes no disposition', async () => {
  const h = harness(); h.start(); await h.flush();
  h.runtime.publishCrewCheckPulse({ id: 'qa-gate', title: 'Synthetic gate', category: 'gate' });
  h.runtime.publishCrewCheckPulse({ id: 'qa-sos', title: 'Synthetic SOS', priority: 'critica', dismissible: false });
  h.time(NOW + 135 * 60_000 + 1); await h.flush();
  assert.equal(h.runtime.currentCrewCheckPulseState().message.id, 'qa-sos'); assert.equal(h.runtime.currentCrewCheckPulseState().queued, 1);
  assert.equal(h.review.readAlertReviews().length, 0); h.cleanup();
});
test('actual completed/cancelled selection rebuilds Home read fence without a roster-render change', async () => {
  const h = harness(); const choice = h.startup.beginRosterChoice();
  h.start(); await h.flush(); assert.equal(h.fetches.length, 0);
  choice.finish(); await h.flush(); assert.equal(h.fetches.length, 1);
  assert.ok(h.runtime.currentCrewCheckPulseState().message); h.cleanup();
});
test('actual selection-start and rendered old roster stay silent until finish; quota is not reset', async () => {
  const h = harness(); h.start(); await h.flush();
  const choice = h.startup.beginRosterChoice(); h.start(); await h.flush();
  assert.equal(h.runtime.currentCrewCheckPulseState().message, null); assert.equal(h.fetches.length, 1);
  h.time(NOW + 60 * 60_000); await h.flush(); assert.equal(h.fetches.length, 1);
  choice.finish(); await h.flush(); assert.equal(h.fetches.length, 2); h.cleanup();
});
test('same-owner token refresh reconstructs a fresh guard without changing roster props', async () => {
  const h = harness(); h.start(); await h.flush();
  h.window.dispatchEvent(new Event('crewcheck:auth-will-change'));
  h.localStorage.setItem('crewcheck_auth_token', 'synthetic-refreshed-token');
  h.window.dispatchEvent(new Event('crewcheck:auth-changed')); await h.flush();
  assert.equal(h.fetches.length, 1); assert.equal(h.runtime.currentCrewCheckPulseState().message, null);
  h.time(NOW + 60 * 60_000); await h.flush(); assert.equal(h.fetches.length, 2); h.cleanup();
});
test('completed selection cannot bind new choice bytes to old committed source with identical roster days', async () => {
  for (const field of ['sourceFileName', 'source']) {
    const h = harness(), choice = h.startup.beginRosterChoice(); h.start(); await h.flush();
    assert.equal(h.fetches.length, 0);
    const next = { ...h.bundle, source: 'New-identical-roster-synthetic.pdf' };
    h.localStorage.setItem(h.startup.startupKey(), JSON.stringify({ owner: h.startup.startupOwner(), selection: 'explicit', roster: next.roster, [field]: next.source }));
    choice.finish(); await h.flush();
    assert.equal(h.fetches.length, 0, 'stale props must not spend hourly budget'); assert.equal(h.notices.length, 0);
    h.replace(next); await h.flush();
    assert.equal(h.fetches.length, 1); assert.equal(h.notices.length, 1); assert.ok(h.runtime.currentCrewCheckPulseState().message);
    h.cleanup();
  }
});
