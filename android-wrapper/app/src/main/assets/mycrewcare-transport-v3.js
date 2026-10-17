/* Generated from shared/myCrewCareObservedContract.mjs; OFF, provisional observations only. */
(function extractMyCrewCareV3(contract) {
'use strict';
/** Pure OFF-only DOM observation. No navigation, authentication or operational import. */
const MYCREWCARE_OBSERVED_RELEASE_ENABLED = false;
const ORIGIN = 'https://api2.apicrewcare.com';
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
function fail() { throw new Error('observed-contract-unverified'); }
function one(root, selector) {
  const nodes = [...root.querySelectorAll(selector)];
  if (nodes.length !== 1) fail();
  return nodes[0];
}
function url(value, path) {
  const parsed = new URL(value);
  if (parsed.origin !== ORIGIN || parsed.pathname !== `/LATAM/${path}` || parsed.username || parsed.password) fail();
  return parsed;
}
function observeMyCrewCareProfile(document, pageUrl) {
  url(pageUrl, 'userprofile.aspx');
  const employee = one(document, 'input#employeeId');
  const username = one(document, 'input#userName');
  if (!employee.readOnly || !username.readOnly || employee.disabled || username.disabled
    || employee.type !== 'number' || !/^\d+$/.test(employee.value) || !clean(username.value)) fail();
  // Local observation only: no claim of global identity or canonical providerSubject.
  return Object.freeze({ employeeId: employee.value, username: username.value });
}
function lines(element) {
  const copy = element.cloneNode(true);
  for (const br of copy.querySelectorAll('br')) br.replaceWith('\n');
  return copy.textContent.split('\n').map(clean).filter(Boolean);
}
function line(values, label) {
  const found = values.filter(value => value.startsWith(`${label}:`));
  if (found.length !== 1) fail();
  const value = clean(found[0].slice(label.length + 1));
  if (!value) fail();
  return value;
}
function wall(value) {
  const match = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) ([0-2]\d:[0-5]\d)$/.exec(value);
  if (!match || Number(match[4].slice(0, 2)) > 23) fail();
  const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[2]) + 1;
  const day = `${match[3]}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const instant = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== day) fail();
  return `${day}T${match[4]}`;
}
function myCrewCareObservedStatus(raw) {
  const text = clean(raw);
  return Object.freeze({ raw: text, display: /^planned$/i.test(text) ? 'Planejada' : /^cancelled$/i.test(text) ? 'Cancelada' : text });
}
function section(root, label, className, bodySelector) {
  const headings = [...root.querySelectorAll(':scope > .callout')].filter(node => {
    const values = [...node.querySelectorAll(':scope > p')];
    return values.length === 1 && clean(values[0].textContent) === label;
  });
  if (headings.length !== 1 || !headings[0].classList.contains(className)) fail();
  const next = headings[0].nextElementSibling;
  if (!next) fail();
  return bodySelector === 'p.hr-info'
    ? (next.matches(bodySelector) ? next : fail())
    : (next.matches('.row') ? one(next, ':scope > .col-sm-6 > p.hr-info') : fail());
}
function transport(element) {
  const values = lines(element);
  const pickupWallTime = line(values, 'Pick-up time');
  const transit = /^(\d+) minutes$/.exec(line(values, 'Transit time'));
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(pickupWallTime) || !transit || Number(transit[1]) > 360) fail();
  const providerName = clean(one(element, 'strong').textContent);
  if (!providerName) fail();
  return Object.freeze({ providerName,
    pickupWallTime, explicitPickupDate: null, transitMinutes: Number(transit[1]) });
}
/** The caller must supply a fresh before/after profile observation from one trusted session.
 * This pure function cannot prove the session or tenant identity; callers must not import its output.
 */
function observeMyCrewCareReservation({ document, pageUrl, card, binding, profileBefore, profileAfter } = {}) {
  const page = url(pageUrl, 'reservation.aspx');
  if (!binding || !binding.sessionId || !binding.requestId || !binding.accountId || binding.fresh !== true
    || !profileBefore || !profileAfter
    || !binding.employeeId || !binding.username
    || [profileBefore, profileAfter].some(p => p.employeeId !== binding.employeeId || p.username !== binding.username
      || p.sessionId !== binding.sessionId || p.requestId !== binding.requestId || p.accountId !== binding.accountId)) fail();
  if (!card || page.searchParams.getAll('tripreservid').length !== 1
    || page.searchParams.getAll('dutyperiodnumber').length !== 1
    || page.searchParams.get('tripreservid') !== card.providerReservationId
    || page.searchParams.get('dutyperiodnumber') !== card.dutyPeriodNumber) fail();
  const root = one(document, '#main-content-scroll.container.white-container.main-content');
  if (clean(one(root, ':scope > h2').textContent) !== 'Reservation') fail();
  const hotel = section(root, 'Hotel', 'hr-icon-hotel', 'p.hr-info');
  const values = lines(hotel);
  const hotelName = clean(one(hotel, 'strong > a[href^="hoteldetails.aspx?"]').textContent);
  if (!hotelName || hotelName !== card.hotelName) fail();
  const checkInWallDateTime = wall(line(values, 'Check-In'));
  const checkOutWallDateTime = wall(line(values, 'Check-Out'));
  if (checkOutWallDateTime <= checkInWallDateTime) fail();
  // Flight pairings must join this detail to this card, never another card.
  for (const label of ['Arriving Flight', 'Departure Flight']) {
    const flight = section(root, label, 'hr-icon-plane', 'p.hr-info');
    if (line(lines(flight), 'Pairing ID') !== card.pairingId
      || !lines(flight)[0].startsWith(`${card.airport} - Flight:`)) fail();
  }
  return Object.freeze({ schemaVersion: 1, operationalImportAllowed: false,
    providerReservationId: card.providerReservationId, dutyPeriodNumber: card.dutyPeriodNumber,
    airport: card.airport, pairingId: card.pairingId, hotelName,
    status: myCrewCareObservedStatus(line(values, 'Confirmation')),
    checkInWallDateTime, checkOutWallDateTime, timeZone: null,
    transportToHotel: transport(section(root, 'Transportation To Hotel', 'hr-icon-transport', '.row')),
    transportToAirport: transport(section(root, 'Transportation To Airport', 'hr-icon-transport', '.row')),
  });
}
function observeMyCrewCareCards(document, pageUrl) {
  url(pageUrl, 'mytravel.aspx');
  const root = one(document, '#layovers');
  const cards = [...root.querySelectorAll(':scope > .my-trips-box')];
  if (!cards.length) fail(); // zero/loading is never authoritative empty
  const keys = new Set();
  return Object.freeze(cards.map(card => {
    const link = one(card, 'p.mt-date a[href^="reservation.aspx?"]');
    const ref = url(new URL(link.getAttribute('href'), `${ORIGIN}/LATAM/`).href, 'reservation.aspx');
    const providerReservationId = ref.searchParams.get('tripreservid');
    const dutyPeriodNumber = ref.searchParams.get('dutyperiodnumber');
    const pairing = /^Pairing ID:\s*(.+)$/.exec(clean(one(card, 'p.mt-pairing-id').textContent));
    const airport = clean(one(card, '.airport-code-box > p').textContent);
    if (!providerReservationId || !dutyPeriodNumber || !pairing || !/^[A-Z]{3}$/.test(airport)
      || ref.searchParams.getAll('tripreservid').length !== 1 || ref.searchParams.getAll('dutyperiodnumber').length !== 1) fail();
    const key = JSON.stringify([providerReservationId, dutyPeriodNumber]);
    if (keys.has(key)) fail(); keys.add(key);
    const hotelName = clean(one(card, 'p.mt-stay-head a[href^="hoteldetails.aspx?"]').textContent);
    if (!hotelName) fail();
    return Object.freeze({ providerReservationId, dutyPeriodNumber, airport, pairingId: pairing[1], hotelName });
  }));
}


try {
  if (!contract || contract.schemaVersion !== 3 || contract.operationalImportAllowed !== false) fail();
  const scope = contract.scope;
  if (!scope || !scope.accountId || !scope.sessionId || !scope.requestId || !Number.isSafeInteger(scope.generation) || scope.generation < 1) fail();
  let rows;
  if (contract.kind === 'profile-before' || contract.kind === 'profile-after') {
    rows = [observeMyCrewCareProfile(document, location.href)];
  } else if (contract.kind === 'cards') {
    rows = observeMyCrewCareCards(document, location.href);
  } else if (contract.kind === 'detail') {
    // Native acquisition already verified profile-before. This is provisional;
    // the native owner must validate profile-after before exposing any result.
    const identity = { employeeId: scope.employeeId, username: scope.username,
      accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId };
    const value = observeMyCrewCareReservation({ document, pageUrl: location.href, card: contract.card,
      binding: { ...scope, fresh: true }, profileBefore: identity, profileAfter: identity });
    rows = [{ providerReservationId: value.providerReservationId, dutyPeriodNumber: value.dutyPeriodNumber,
      airport: value.airport, pairingId: value.pairingId, hotelName: value.hotelName,
      confirmationRaw: value.status.raw, checkInWallDateTime: value.checkInWallDateTime,
      checkOutWallDateTime: value.checkOutWallDateTime,
      toHotelProvider: value.transportToHotel.providerName, toHotelPickupWallTime: value.transportToHotel.pickupWallTime,
      toHotelTransitMinutes: String(value.transportToHotel.transitMinutes),
      toAirportProvider: value.transportToAirport.providerName, toAirportPickupWallTime: value.transportToAirport.pickupWallTime,
      toAirportTransitMinutes: String(value.transportToAirport.transitMinutes) }];
  } else fail();
  return JSON.stringify({ schemaVersion: 3, operationalImportAllowed: false,
    accountId: scope.accountId, sessionId: scope.sessionId, requestId: scope.requestId,
    generation: scope.generation, kind: contract.kind, rows });
} catch (_) { return JSON.stringify({ schemaVersion: 3, operationalImportAllowed: false, error: 'observed-contract-unverified' }); }

})
