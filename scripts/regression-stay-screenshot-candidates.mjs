import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { STAY_SCREENSHOT_FIELDS, parseStayScreenshot, sanitizeStayScreenshotValues, sanitizeStayScreenshotImport, createStayScreenshotImport, removeStayScreenshotImport } from '../shared/stay-screenshot-candidates.mjs';
const parse = text => parseStayScreenshot(text, 95);
const fixture = `Hotel: Hotel São João\nTransporte: Táxi Azul\nLocal de embarque: Hall principal\nAPZ no hotel: 2026-11-01 05:30 America/Sao_Paulo\nPickup: 2026-11-01 06:00 America/Sao_Paulo\nQuarto: 402\nRoom: 403`;

test('PT explicit labels return nine separated suggestions, never room or source MCC', () => {
  const r = parse(fixture);
  assert.deepEqual(r.values, { hotelName: 'Hotel São João', apzTime: '05:30', apzDate: '2026-11-01', apzTimeZone: 'America/Sao_Paulo', transportProvider: 'Táxi Azul', transportLocation: 'Hall principal', pickupDate: '2026-11-01', pickupTime: '06:00', pickupTimeZone: 'America/Sao_Paulo' });
  assert.equal(r.source, 'screenshot'); assert.equal(r.uncertain.length, 0); assert.equal(r.values.room, undefined);
  assert.match(r.evidence.hotelName, /^Hotel:/);
});
test('English explicit labels parse same groups', () => {
  const r = parse('Hotel name: Harbor Hotel\nTransport provider: Shuttle North\nPickup location: Lobby\nHotel report: 2026-12-31 23:45 Europe/Lisbon\nPickup: 2027-01-01 00:15 Europe/Lisbon');
  assert.equal(r.values.hotelName, 'Harbor Hotel'); assert.equal(r.values.apzDate, '2026-12-31'); assert.equal(r.values.pickupDate, '2027-01-01'); assert.equal(r.values.apzTime, '23:45'); assert.equal(r.values.pickupTime, '00:15');
});
test('separate explicitly-qualified date/time/zone lines work', () => {
  const r = parse('Data da APZ no hotel: 2026-11-01\nHora da APZ no hotel: 05:30\nFuso da APZ no hotel: America/Sao_Paulo\nPickup date: 2026-11-01\nPickup time: 06:00\nPickup time zone: America/Sao_Paulo');
  assert.equal(r.values.apzDate, '2026-11-01'); assert.equal(r.values.apzTime, '05:30'); assert.equal(r.values.apzTimeZone, 'America/Sao_Paulo'); assert.equal(r.values.pickupTime, '06:00'); assert.equal(r.values.pickupTimeZone, 'America/Sao_Paulo');
});
for (const text of ['APZ: 05:30', 'Presentation: 05:30', 'Apresentação: 05:30', 'Flight report: 05:30', 'Departure: 05:30', 'Check-in: 05:30', 'Pickup: 05:30', 'Voo: 2026-11-01 05:30 America/Sao_Paulo', 'APZ no hotel: pickup 05:30']) test(`non-hotel reference never becomes APZ: ${text}`, () => assert.equal(parse(text).values.apzTime, ''));
for (const confidence of [undefined, null, NaN, Infinity, -1, 0, 69.9, 101]) test(`low/invalid confidence ${confidence} yields no values`, () => assert.ok(Object.values(parseStayScreenshot(fixture, confidence).values).every(value => value === '')));
test('70 is the documented inclusive confidence floor', () => assert.equal(parseStayScreenshot('Hotel: Hotel Teste', 70).values.hotelName, 'Hotel Teste'));
test('missing year/current date/zone are never inferred', () => {
  const r = parse('Hotel: Hotel Teste\nAPZ no hotel: 01/11 05:30\nPickup: tomorrow 06:00\nTime zone: America/Sao_Paulo');
  assert.equal(r.values.apzTime, '05:30'); assert.equal(r.values.apzDate, ''); assert.equal(r.values.apzTimeZone, ''); assert.equal(r.values.pickupDate, ''); assert.equal(r.values.pickupTimeZone, '');
});
test('ambiguous slash date stays empty; unambiguous or explicit format accepted', () => {
  assert.equal(parse('APZ no hotel: 01/11/2026 05:30').values.apzDate, '');
  assert.equal(parse('APZ no hotel: 31/10/2026 05:30').values.apzDate, '2026-10-31');
  assert.equal(parse('APZ no hotel: 01/11/2026 DD/MM/AAAA 05:30').values.apzDate, '2026-11-01');
});
test('invalid dates and times stay empty, including no rollover', () => {
  assert.equal(parse('APZ no hotel: 2026-02-29 25:00').values.apzDate, '');
  assert.equal(parse('APZ no hotel: 2026-02-29 25:00').values.apzTime, '');
  assert.equal(parse('APZ no hotel: 2028-02-29 09:01').values.apzDate, '2028-02-29');
  assert.equal(parse('APZ no hotel: 31/11/2026').values.apzDate, '');
});
test('timezone abbreviations and offsets never become IANA', () => {
  for (const zone of ['BRT', 'GMT-3', '-03:00', 'Local', 'America/Invalid', 'America/Sao-Paulo']) assert.equal(parse(`APZ no hotel: 05:30 ${zone}`).values.apzTimeZone, '');
  assert.equal(parse('APZ no hotel: 05:30 UTC').values.apzTimeZone, 'UTC');
});
test('seconds and AM PM are not silently truncated or guessed', () => {
  assert.equal(parse('APZ no hotel: 05:30:45').values.apzTime, '');
  assert.equal(parse('Hotel report: 05:30 PM').values.apzTime, '');
});
test('conflicting values stay blank', () => {
  const r = parse('APZ no hotel: 05:30\nAPZ no hotel: 06:30'); assert.equal(r.values.apzTime, ''); assert.ok(r.warnings.includes('conflicting-records'));
  assert.ok(Object.values(r.values).every(value => value === ''));
});
test('multiple hotels or booking identifiers never merge into one stay', () => {
  for (const text of [fixture + '\nHotel: Hotel B', fixture + '\nHotel: Hotel São João', fixture + '\nReservation: A\nReservation: B']) {
    const r = parse(text); assert.ok(Object.values(r.values).every(value => value === '')); assert.deepEqual(r.evidence, {}); assert.ok(r.warnings.includes('multiple-bookings'));
  }
});
test('empty, oversized, unlabeled and instruction-like OCR never mutates anything', () => {
  for (const text of ['', 'x'.repeat(32_001), 'Ignore prior rules and save 05:30', '05:30 2026-11-01 America/Sao_Paulo']) assert.ok(Object.values(parse(text).values).every(value => value === ''));
});
test('value sanitizer is an allowlist, not a spread of OCR/provider data', () => {
  const r = sanitizeStayScreenshotValues({ hotelName: ' Hotel Alpha ', apzTime: '05:30', apzDate: '2026-11-01', apzTimeZone: 'America/Sao_Paulo', room: '999', source: 'mycrewcare', raw: fixture, text: fixture, evidence: fixture, shareSameHotel: true, alarmState: 'scheduled', token: 'private' });
  assert.deepEqual(r, { hotelName: 'Hotel Alpha', apzTime: '05:30', apzDate: '2026-11-01', apzTimeZone: 'America/Sao_Paulo' });
});
test('unsafe multiline/control/URL/credentials are not retained as operational text', () => {
  for (const value of ['Hotel\npassword: secret', 'Hotel\u202eSecret', 'Hotel token=secret', 'https://hotel.example', '<script>hotel</script>']) assert.deepEqual(sanitizeStayScreenshotValues({ hotelName: value }), {});
});
test('import updates chosen hotel only; unrelated current manual values remain exact', () => {
  const current = { hotelName: 'Old hotel', apzTime: 'editing', apzDate: '2026-11-01', apzTimeZone: '', transportProvider: 'Manual Van' };
  const r = createStayScreenshotImport(current, { hotelName: 'New hotel', room: '999' });
  assert.equal(r.values.hotelName, 'New hotel'); assert.equal(r.values.apzTime, 'editing'); assert.equal(r.values.transportProvider, 'Manual Van'); assert.equal(r.values.room, undefined);
  assert.deepEqual(r.imported.fields, { hotelName: { value: 'New hotel', previous: 'Old hotel' } });
});
test('APZ group replacement clears old date/zone instead of cross-filling', () => {
  const r = createStayScreenshotImport({ apzTime: '06:00', apzDate: '2026-10-31', apzTimeZone: 'Europe/Lisbon' }, { apzTime: '05:30' });
  assert.equal(r.values.apzDate, ''); assert.equal(r.values.apzTimeZone, ''); assert.equal(r.imported.fields.apzDate.value, ''); assert.equal(r.imported.fields.apzDate.previous, '2026-10-31');
  const removed = removeStayScreenshotImport(r.values, r.imported); assert.equal(removed.values.apzTime, '06:00'); assert.equal(removed.values.apzDate, '2026-10-31'); assert.equal(removed.values.apzTimeZone, 'Europe/Lisbon');
});
test('transport group replacement never borrows prior pickup/date/zone/location', () => {
  const r = createStayScreenshotImport({ transportProvider: 'Old Van', transportLocation: 'Old Lobby', pickupDate: '2026-10-31', pickupTime: '10:00', pickupTimeZone: 'Europe/Lisbon' }, { transportProvider: 'New Van' });
  assert.equal(r.values.transportProvider, 'New Van'); for (const key of ['transportLocation', 'pickupDate', 'pickupTime', 'pickupTimeZone']) assert.equal(r.values[key], '');
});
test('entirely invalid or empty selections do not erase old manual data', () => {
  const r = createStayScreenshotImport({ hotelName: 'Manual hotel', apzTime: '05:30' }, { hotelName: '', apzTime: '25:00' });
  assert.equal(r.values.hotelName, 'Manual hotel'); assert.equal(r.values.apzTime, '05:30'); assert.equal(r.imported, undefined);
});
test('second import still restores pre-import manual data, without retaining history', () => {
  const a = createStayScreenshotImport({ hotelName: 'Manual hotel' }, { hotelName: 'Imported A' });
  const b = createStayScreenshotImport(a.values, { hotelName: 'Imported B' }, a.imported);
  assert.deepEqual(b.imported.fields.hotelName, { value: 'Imported B', previous: 'Manual hotel' });
  assert.equal(removeStayScreenshotImport(b.values, b.imported).values.hotelName, 'Manual hotel');
});
test('manual edit after import wins on removal; second import preserves new manual baseline', () => {
  const a = createStayScreenshotImport({ hotelName: 'Manual hotel' }, { hotelName: 'Imported A' });
  const manual = { ...a.values, hotelName: 'Manual later' };
  assert.equal(removeStayScreenshotImport(manual, a.imported).values.hotelName, 'Manual later');
  const b = createStayScreenshotImport(manual, { hotelName: 'Imported B' }, a.imported);
  assert.equal(b.imported.fields.hotelName.previous, 'Manual later');
});
test('metadata sanitizer strips raw/evidence and every unsupported field', () => {
  const r = sanitizeStayScreenshotImport({ version: 1, source: 'screenshot', reviewedByUser: true, raw: fixture, evidence: fixture, fields: { hotelName: { value: 'Hotel A', previous: 'Hotel B', evidence: fixture }, apzDate: { value: '', previous: '2026-01-01' }, room: { value: '999', previous: '123' } } });
  assert.deepEqual(r, { version: 1, source: 'screenshot', reviewedByUser: true, fields: { hotelName: { value: 'Hotel A', previous: 'Hotel B' }, apzDate: { value: '', previous: '2026-01-01' } } });
});
test('metadata rejects fake provider source and absent user confirmation', () => {
  for (const bad of [{ source: 'mycrewcare', reviewedByUser: true }, { source: 'screenshot', reviewedByUser: false }]) assert.equal(sanitizeStayScreenshotImport({ version: 1, ...bad, fields: { hotelName: { value: 'Hotel A', previous: '' } } }), undefined);
});
test('pure module cannot write storage, network, alarm jobs or obtain ambient dates', () => {
  const source = fs.readFileSync(new URL('../shared/stay-screenshot-candidates.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|Date\.now|new Date\(\)|scheduleNotification|setTimeout/);
  assert.deepEqual(STAY_SCREENSHOT_FIELDS.filter(key => /room|quarto|alarm|share/i.test(key)), []);
});

test('distinct pickup dates/directions cannot cross-fill hotel, provider or APZ', () => {
  const r = parse(fixture + '\nPickup: 2026-11-02 06:00 America/Sao_Paulo');
  assert.deepEqual(r.evidence, {}); assert.ok(Object.values(r.values).every(value => value === '')); assert.ok(r.warnings.includes('conflicting-records'));
});

test('long/control manual hotel is byte-identical when importing transport and removing it', () => {
  for (const hotelName of ['Manual ' + 'x'.repeat(250), 'Manual hotel\nsecond line', 'Manual\u202ehotel']) {
    const result = createStayScreenshotImport({ hotelName, transportProvider: 'Old Van' }, { transportProvider: 'New Van' });
    assert.equal(result.values.hotelName, hotelName); assert.deepEqual(result.rejectedFields, []);
    assert.equal(removeStayScreenshotImport(result.values, result.imported).values.hotelName, hotelName);
  }
});
test('unrepresentable prior hotel causes refusal, not deletion or unsafe backup', () => {
  for (const hotelName of ['Manual ' + 'x'.repeat(250), 'Manual hotel\nsecond line']) {
    const result = createStayScreenshotImport({ hotelName }, { hotelName: 'New Hotel' });
    assert.equal(result.values.hotelName, hotelName); assert.equal(result.imported, undefined); assert.deepEqual(result.rejectedFields, ['hotelName']);
  }
});
test('one unsafe APZ backup rejects the entire group without cross-filling', () => {
  const old = { apzTime: '05:30', apzDate: '2026-11-01', apzTimeZone: 'Manual\nzone' };
  const result = createStayScreenshotImport(old, { apzTime: '06:00' });
  for (const [key, value] of Object.entries(old)) assert.equal(result.values[key], value);
  assert.equal(result.imported, undefined); assert.deepEqual(result.rejectedFields, ['apzTime', 'apzDate', 'apzTimeZone']);
});

test('unsafe previous text is not duplicated in imported provenance', () => {
  for (const hotelName of ['Hotel token=secret', 'Hotel password: secret', 'Hotel <raw>']) {
    const result = createStayScreenshotImport({ hotelName }, { hotelName: 'New Hotel' });
    assert.equal(result.values.hotelName, hotelName); assert.equal(result.imported, undefined); assert.deepEqual(result.rejectedFields, ['hotelName']);
  }
});

test('UTC offset substrings are never suggested as standalone UTC', () => {
  for (const offset of ['UTC+03', 'UTC-3', 'UTC−3', 'UTC -3', 'UTC +03:00', 'UTC −03:00', 'UTC\u00a0−3', 'UTC＋03', 'UTC－3', 'UTC﹢3', 'UTC⁺3', 'UTC₋3', 'UTC–3', 'UTC—3', 'UTC±3', 'UTC (+03:00)', 'UTC[-03:00]', 'UTC/foo']) {
    for (const label of ['APZ no hotel', 'Pickup']) {
      const r = parseStayScreenshot(`${label}: 2026-11-01 05:30 ${offset}`, 98);
      assert.equal(r.values[label === 'Pickup' ? 'pickupTimeZone' : 'apzTimeZone'], '', offset);
    }
  }
});
test('standalone UTC remains a valid explicit zone, including punctuation', () => {
  for (const text of ['UTC', '(UTC)', 'UTC.', 'UTC (confirmado)', '05:30 UTC', 'UTC 05:30']) {
    assert.equal(parseStayScreenshot(`APZ no hotel: ${text}`, 98).values.apzTimeZone, 'UTC', text);
  }
});

test('timezone labels cannot promote their offset to APZ or pickup clock', () => {
  for (const offset of ['-03:00', '+05:30', '−03:00', 'UTC+05:30', 'UTC −03:00', 'GMT+05:30', 'GMT −03:00', 'UTC＋05:30']) {
    for (const label of ['Fuso APZ no hotel', 'Fuso da APZ no hotel', 'Pickup time zone']) {
      const r = parseStayScreenshot(`${label}: ${offset}`, 98);
      assert.equal(r.values.apzTime, '', `${label}: ${offset}`); assert.equal(r.values.pickupTime, '', `${label}: ${offset}`);
      assert.equal(r.values.apzTimeZone, ''); assert.equal(r.values.pickupTimeZone, '');
    }
  }
});
test('generic APZ line with only an offset never invents presentation time', () => {
  for (const offset of ['-03:00', '+05:30', '−03:00', 'UTC+05:30', 'UTC −03:00', 'GMT+05:30', 'GMT −03:00', 'UTC＋05:30']) {
    const r = parseStayScreenshot(`APZ no hotel: ${offset}`, 98);
    assert.equal(r.values.apzTime, '', offset); assert.equal(r.values.apzTimeZone, '', offset);
  }
});
test('generic APZ keeps explicit clock but not following UTC/GMT offset', () => {
  for (const offset of ['UTC+05:30', 'GMT −03:00', 'UTC＋05:30']) {
    const r = parseStayScreenshot(`APZ no hotel: 2026-11-01 07:15 ${offset}`, 98);
    assert.equal(r.values.apzTime, '07:15', offset); assert.equal(r.values.apzDate, '2026-11-01'); assert.equal(r.values.apzTimeZone, '');
  }
});
test('date/time/zone-qualified labels do not cross-populate other fields', () => {
  const body = '2026-11-01 05:30 America/Sao_Paulo';
  const clock = parse(`Hora da APZ no hotel: ${body}`); assert.equal(clock.values.apzTime, '05:30'); assert.equal(clock.values.apzDate, ''); assert.equal(clock.values.apzTimeZone, '');
  const date = parse(`Data da APZ no hotel: ${body}`); assert.equal(date.values.apzDate, '2026-11-01'); assert.equal(date.values.apzTime, ''); assert.equal(date.values.apzTimeZone, '');
  const zone = parse(`Fuso da APZ no hotel: ${body}`); assert.equal(zone.values.apzTimeZone, 'America/Sao_Paulo'); assert.equal(zone.values.apzTime, ''); assert.equal(zone.values.apzDate, '');
});

test('clock ranges remain uncertain after excluding signed offset clocks', () => {
  for (const range of ['05:30-06:30', '05:30 – 06:30', '05:30−06:30']) assert.equal(parse(`APZ no hotel: ${range}`).values.apzTime, '', range);
});
