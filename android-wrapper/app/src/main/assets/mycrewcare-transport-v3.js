/*
 * MyCrewCare v3 structured extraction.
 *
 * The native verifier must supply an exact, provider-reviewed CSS contract. This
 * asset has no body/ancestor/text-search fallback and returns only normalized
 * hotel/transport fields. It never reads form inputs, credentials or room data.
 */
(function extractMyCrewCareV3(contract) {
  'use strict';

  var clean = function (value, max) {
    var result = String(value == null ? '' : value)
      .replace(/\u00a0/g, ' ')
      .replace(/[\t\r\n ]+/g, ' ')
      .trim();
    return result.length > 0 && result.length <= max ? result : '';
  };
  var selector = function (value) {
    var result = clean(value, 180);
    return result && !/[{};]/.test(result) ? result : '';
  };
  var one = function (root, css, required, max) {
    if (!css) return required ? null : '';
    var matches;
    try { matches = root.querySelectorAll(css); } catch (_) { return null; }
    if (matches.length !== 1) return required ? null : '';
    var element = matches[0];
    var value = element.getAttribute('data-crewcheck-value');
    if (value == null) value = element.textContent;
    var result = clean(value, max);
    return required && !result ? null : result;
  };
  var fail = function (error) { return JSON.stringify({ schemaVersion: 3, records: [], error: error }); };

  try {
    if (!contract || contract.schemaVersion !== 1 || contract.activeOnly !== true || contract.dateOrder !== 'DMY') {
      return fail('unverified-dom-contract');
    }
    var recordSelector = selector(contract.recordSelector);
    var fields = contract.fields || {};
    var required = ['pickupDate', 'pickupTime', 'airport', 'pairingId', 'hotelName'];
    if (!recordSelector || required.some(function (key) { return !selector(fields[key]); })) {
      return fail('unverified-dom-contract');
    }
    var cards = document.querySelectorAll(recordSelector);
    if (cards.length > 100) return fail('too-many-records');
    var records = [];
    var seen = Object.create(null);

    for (var index = 0; index < cards.length; index += 1) {
      var card = cards[index];
      if (card.querySelectorAll(recordSelector).length) continue;
      var rawDate = one(card, selector(fields.pickupDate), true, 16);
      var time = one(card, selector(fields.pickupTime), true, 8);
      var airport = one(card, selector(fields.airport), true, 8);
      var pairingId = one(card, selector(fields.pairingId), true, 120);
      var hotelName = one(card, selector(fields.hotelName), true, 240);
      if ([rawDate, time, airport, pairingId, hotelName].some(function (value) { return value === null; })) {
        return fail('ambiguous-required-field');
      }
      var dateParts = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      var date = dateParts ? dateParts[3] + '-' + dateParts[2] + '-' + dateParts[1] : '';
      airport = airport.toUpperCase();
      if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^[A-Z]{3}$/.test(airport)) {
        return fail('invalid-required-field');
      }
      var dateEpoch = Date.parse(date + 'T00:00:00Z');
      if (!Number.isFinite(dateEpoch) || new Date(dateEpoch).toISOString().slice(0, 10) !== date) {
        return fail('invalid-date');
      }

      var status = one(card, selector(fields.status), false, 40).toLowerCase() || 'published';
      var configuredStatuses = Array.isArray(contract.activeStatusValues)
        ? contract.activeStatusValues.map(function (value) { return clean(value, 40).toLowerCase(); }).filter(Boolean)
        : [];
      if (configuredStatuses.length > 0 && configuredStatuses.indexOf(status) === -1) continue;
      if (status !== 'published' && status !== 'changed' && status !== 'cancelled') {
        status = 'published';
      }

      var transitText = one(card, selector(fields.transitMinutes), false, 24);
      var transitMatch = transitText.match(/^(\d{1,3})(?:\s*(?:min|minutes?))?$/i);
      var transitMinutes = transitMatch && Number(transitMatch[1]) <= 360 ? Number(transitMatch[1]) : null;
      var record = {
        direction: 'to_airport',
        date: date,
        time: time,
        airport: airport,
        pairingId: pairingId,
        hotelName: hotelName,
        providerRecordId: one(card, selector(fields.providerRecordId), false, 180) || null,
        hotelAddress: one(card, selector(fields.hotelAddress), false, 320) || null,
        hotelPhone: one(card, selector(fields.hotelPhone), false, 80) || null,
        reservationStartAt: one(card, selector(fields.reservationStartAt), false, 40) || null,
        reservationEndAt: one(card, selector(fields.reservationEndAt), false, 40) || null,
        pickupLocation: one(card, selector(fields.pickupLocation), false, 240) || null,
        transportProvider: one(card, selector(fields.transportProvider), false, 180) || null,
        transportPhone: one(card, selector(fields.transportPhone), false, 80) || null,
        transitMinutes: transitMinutes,
        status: status
      };
      var key = JSON.stringify(record);
      if (!seen[key]) {
        seen[key] = true;
        records.push(record);
      }
      if (records.length > 50) return fail('too-many-records');
    }
    return JSON.stringify({ schemaVersion: 3, records: records });
  } catch (_) {
    return fail('extraction-error');
  }
})
