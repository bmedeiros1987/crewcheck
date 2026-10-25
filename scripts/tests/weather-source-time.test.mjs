import assert from 'node:assert/strict';
import test from 'node:test';
import { weatherObservationSourceTime as prove } from '../../shared/weather-observation-source-time.mjs';
const raw = 'METAR SBPS 021730Z 02015G30KT 9000 -RA BKN042';
const time = Date.parse('2032-02-02T17:30:00Z');
const red = value => ({ provider: 'redemet', source: { field: 'validade_inicial', value }, raw });
test('exact REDEMET observation field/calendar is normalized without the host timezone', () => {
  assert.equal(prove(red('2032-02-02 17:30:00')), time);
  assert.equal(prove({ ...red('2032-02-02 17:30:00'), raw: raw.replace('METAR', 'SPECI') }), time);
});
for (const value of ['203202021730', 1959355800, '2032-02-02T17:30:00Z', '2032-02-02 17:30:00suffix',
  '2032-2-2 17:30:00', '2032-02-31 17:30:00', '2031-02-29 17:30:00', '2032-02-02 24:00:00',
  '2032-02-02 17:60:00', '2032-02-02 17:30:60', '2032-02-03 17:30:00', null]) {
  test(`REDEMET rejects undocumented/invalid/mismatching value ${String(value)}`, () => assert.equal(prove(red(value)), null));
}
for (const field of ['recebimento', 'data', 'reportTime', '', undefined]) test(`receipt/unknown field ${field} cannot certify observation`, () => {
  assert.equal(prove({ ...red('2032-02-02 17:30:00'), source: { field, value: '2032-02-02 17:30:00' } }), null);
});
test('real leap day and year rollover use the source date, never the current month', () => {
  assert.equal(prove({ ...red('2032-02-29 17:30:00'), raw: raw.replace('021730Z', '291730Z') }), Date.parse('2032-02-29T17:30:00Z'));
  assert.equal(prove({ ...red('2031-12-31 23:59:00'), raw: raw.replace('021730Z', '312359Z') }), Date.parse('2031-12-31T23:59:00Z'));
});
test('AviationWeather accepts only obsTime and explicit absolute time with raw agreement', () => {
  for (const value of [time, time / 1000, String(time / 1000), '2032-02-02T17:30:00Z', '2032-02-02T14:30:00-03:00'])
    assert.equal(prove({ provider: 'aviationweather', source: { field: 'obsTime', value }, raw }), time);
  for (const value of ['2032-02-02T17:30:00', '2032-02-02 17:30:00', time + 60_000, NaN, Infinity, time + .5])
    assert.equal(prove({ provider: 'aviationweather', source: { field: 'obsTime', value }, raw }), null);
  for (const field of ['reportTime', 'issueTime', 'validTimeFrom']) assert.equal(prove({ provider: 'aviationweather', source: { field, value: time }, raw }), null);
});

test('AviationWeather rejects calendar/time normalization instead of laundering it', () => {
  for (const value of ['2032-02-31T00:00:00Z', '2032-02-02T24:00:00Z', '2032-02-02T17:60:00Z', '2032-02-02T17:30:60Z']) {
    const parsed = new Date(value), group = Number.isFinite(parsed.getTime()) ? [parsed.getUTCDate(), parsed.getUTCHours(), parsed.getUTCMinutes()].map(v => String(v).padStart(2, '0')).join('') : '021730';
    assert.equal(prove({ provider: 'aviationweather', source: { field: 'obsTime', value }, raw: raw.replace('021730Z', group + 'Z') }), null);
  }
});
