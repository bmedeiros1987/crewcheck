import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MYCREWCARE_OBSERVED_RELEASE_ENABLED, observeMyCrewCareCards,
  observeMyCrewCareProfile, observeMyCrewCareReservation, myCrewCareObservedStatus } from '../shared/myCrewCareObservedContract.mjs';
const require = createRequire(process.env.WAKEUP_JSDOM_PACKAGE ?? import.meta.url);
const { JSDOM } = require('jsdom');
const fixture = name => readFileSync(new URL(`./fixtures/mycrewcare-observed/${name}.synthetic.html`, import.meta.url), 'utf8');
const dom = html => new JSDOM(html).window.document;
const origin = 'https://api2.apicrewcare.com/LATAM/';
const card = observeMyCrewCareCards(dom(fixture('mytravel')), `${origin}mytravel.aspx`)[0];
const profile = observeMyCrewCareProfile(dom(fixture('profile')), `${origin}userprofile.aspx`);
const binding = { ...profile, sessionId: 'session-synthetic', requestId: 'request-synthetic', accountId: 'account-synthetic', fresh: true };
const boundProfile = { ...profile, sessionId: binding.sessionId, requestId: binding.requestId, accountId: binding.accountId };
const parse = (html = fixture('reservation'), extra = {}) => observeMyCrewCareReservation({
  document: dom(html), pageUrl: `${origin}reservation.aspx?tripreservid=900000001&dutyperiodnumber=1`,
  card, binding, profileBefore: boundProfile, profileAfter: boundProfile, ...extra,
});
test('OFF observation preserves direction, raw state and wall values without operational import', () => {
  const value = parse();
  assert.equal(MYCREWCARE_OBSERVED_RELEASE_ENABLED, false);
  assert.equal(value.operationalImportAllowed, false);
  assert.deepEqual(value.status, { raw: 'Planned', display: 'Planejada' });
  assert.equal(value.checkInWallDateTime, '2031-11-19T22:30');
  assert.equal(value.checkOutWallDateTime, '2031-11-20T06:45');
  assert.equal(value.transportToHotel.pickupWallTime, '21:50');
  assert.equal(value.transportToAirport.pickupWallTime, '07:05');
  assert.equal(value.transportToHotel.explicitPickupDate, null);
  assert.equal(value.transportToAirport.explicitPickupDate, null);
  assert.equal(value.timeZone, null);
  assert.equal('presentationAt' in value, false);
  assert.equal(Object.isFrozen(value), true);
});
test('status translations are behavioral evidence, never Confirmada or unknown coercion', () => {
  assert.deepEqual(myCrewCareObservedStatus('CANCELLED'), { raw: 'CANCELLED', display: 'Cancelada' });
  assert.deepEqual(myCrewCareObservedStatus('Pending review'), { raw: 'Pending review', display: 'Pending review' });
});
test('profile identity stays a string; display names cannot substitute readonly fields', () => {
  assert.equal(profile.employeeId, '900000001');
  for (const html of [fixture('profile').replace(' readonly', ''), fixture('profile').replace('id="employeeId"', 'id="wrong"'),
    fixture('profile').replace('<input id="employeeId"', '<input disabled id="employeeId"'),
    fixture('profile').replace('</body>', '<input id="employeeId" type="number" readonly value="123"></body>')]) {
    assert.throws(() => observeMyCrewCareProfile(dom(html), `${origin}userprofile.aspx`));
  }
});
test('missing, stale or mismatched same-session comparison fails closed', () => {
  for (const extra of [{ binding: null }, { binding: { ...binding, fresh: false } }, { profileBefore: null },
    { profileAfter: { ...boundProfile, employeeId: 'different' } }, { profileBefore: { ...boundProfile, username: 'other' } },
    { profileAfter: { ...boundProfile, sessionId: 'older-session' } }, { profileBefore: { ...boundProfile, requestId: 'old-request' } },
    { profileAfter: { ...boundProfile, accountId: 'other-account' } }]) assert.throws(() => parse(undefined, extra));
});
test('login, zero cards, duplicate or partial cards are never authoritative empty', () => {
  for (const html of ['<h2>Login</h2>', '<div id="layovers"></div>', fixture('mytravel').replace('mt-pairing-id', 'missing'),
    fixture('mytravel').replace('</body>', fixture('mytravel') + '</body>')]) {
    assert.throws(() => observeMyCrewCareCards(dom(html), `${origin}mytravel.aspx`));
  }
});
test('partial, ambiguous or mismatched detail never borrows another section/card', () => {
  for (const html of [fixture('reservation').replace('Transportation To Airport', 'Unlabeled'),
    fixture('reservation').replace('Pick-up time: 07:05', 'Pick-up time: unknown'),
    fixture('reservation').replace('Check-Out: 20 Nov 2031 06:45', 'Check-Out: 18 Nov 2031 06:45'),
    fixture('reservation').replace('Pairing ID: SYNTHETIC-PAIRING-001', 'Pairing ID: OTHER'),
    fixture('reservation').replace('<h2>Reservation</h2>', '<h2>Login</h2>')]) assert.throws(() => parse(html));
  assert.throws(() => parse(undefined, { card: { ...card, hotelName: 'another hotel' } }));
  assert.throws(() => parse(undefined, { pageUrl: `${origin}reservation.aspx?tripreservid=OTHER&dutyperiodnumber=1` }));
});
test('exact origin and tenant required; source feedback dates are ignored', () => {
  for (const url of ['https://evil.invalid/LATAM/mytravel.aspx', 'http://api2.apicrewcare.com/LATAM/mytravel.aspx', `${origin}../OTHER/mytravel.aspx`]) {
    assert.throws(() => observeMyCrewCareCards(dom(fixture('mytravel')), url));
  }
  assert.equal('date' in card, false);
  assert.equal('checkIn' in card, false);
});
