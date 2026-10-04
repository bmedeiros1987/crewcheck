/* PR #872 transport-only extraction, tightened for review; not authentication proof.
 * The LATAM date contract must be physically verified as DMY before release.
 * Native verifies origin + provider identity within the verifier-owned atomic snapshot.
 */
(function (verifiedCardSelector) {
  'use strict';
  try {
    var clean = function (value) { return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim(); };
    var label = function (text, pattern) {
      var matches = Array.from(text.matchAll(new RegExp('^' + pattern + '[ \\t]*:[ \\t]*([^\\n\\r]{1,160})[ \\t]*$', 'gim')));
      return matches.length === 1 ? clean(matches[0][1]) : '';
    };
    var records = [];
    var seen = Object.create(null);
    // No guessed ancestor/body fallback. Native supplies this from the reviewed
    // provider DOM contract, never from page text, an event or user credentials.
    if (typeof verifiedCardSelector !== 'string' || !verifiedCardSelector.trim() || verifiedCardSelector.length > 160) {
      return JSON.stringify({ records: [], error: 'unverified-dom-contract' });
    }
    var elements = document.querySelectorAll(verifiedCardSelector);
    if (elements.length > 2000) return JSON.stringify({ records: [], error: 'page-too-large' });
    for (var index = 0; index < elements.length; index += 1) {
      // A matched outer wrapper must not combine a partial nested card with siblings.
      if (elements[index].querySelectorAll(verifiedCardSelector).length) continue;
      var text = clean(elements[index].innerText);
      if (text.length < 35 || text.length > 4500) continue;
      var headings = text.match(/Transportation\s+To\s+(?:Airport|Hotel)/gi) || [];
      if (headings.length !== 1 || !/^Transportation[ \t]+To[ \t]+Airport[ \t]*$/im.test(text)
        || /\b(?:cancelled|canceled|cancelado|cancelada|historical|expired|expirado)\b/i.test(text)) continue;
      var rawDate = label(text, 'Pick[- ]?up[- ]?date');
      var dateParts = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      var date = dateParts ? dateParts[3] + '-' + dateParts[2] + '-' + dateParts[1] : '';
      var time = label(text, 'Pick[- ]?up[- ]?time');
      var airport = label(text, '(?:Airport|Station)').toUpperCase();
      var pairingId = label(text, 'Pairing ID');
      var hotel = label(text, 'Hotel');
      if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^[A-Z]{3}$/.test(airport) || !pairingId || !hotel) continue;
      var epoch = Date.parse(date + 'T00:00:00Z');
      if (!Number.isFinite(epoch) || new Date(epoch).toISOString().slice(0, 10) !== date) continue;
      var transit = label(text, '(?:Transit|Travel)(?: time)?');
      var minutes = transit.match(/^(\d{1,3})\s*(?:min|minutes)$/i);
      var record = { direction: 'to_airport', date: date, time: time, airport: airport, pairingId: pairingId, hotel: hotel,
        transitMinutes: minutes && Number(minutes[1]) <= 360 ? Number(minutes[1]) : null };
      var key = JSON.stringify(record);
      if (!seen[key]) { seen[key] = true; records.push(record); }
      if (records.length > 20) return JSON.stringify({ records: [], error: 'too-many-records' });
    }
    return JSON.stringify({ records: records });
  } catch (_) { return JSON.stringify({ records: [], error: 'extraction-error' }); }
})
