import assert from 'node:assert/strict';
import test from 'node:test';
import { baseTimeZone, resolveTimeZoneChoice, timeZoneOffsetLabel } from '../shared/timezone-choice.mjs';
import { normalizePickupLocal, presentPickup, presentStayInstant, resolveStayDisplayZone } from '../shared/stay-time-presentation.mjs';
import { emptyStayEditor, readStayEditor, writeStayEditor } from '../shared/stay-editor-store.mjs';

test('event/base/UTC/manual reuse IANA resolution without device or Brasilia fallback', () => {
  const context = { localZone: 'America/Manaus', baseZone: baseTimeZone('FOR') };
  for (const [source, expected] of [['local','America/Manaus'],['base','America/Fortaleza'],['utc','UTC']]) assert.equal(resolveStayDisplayZone({ source }, context).zone, expected);
  assert.equal(resolveStayDisplayZone({ source: 'manual', manualZone: 'Europe/Lisbon' }, context).zone, 'Europe/Lisbon');
  assert.equal(resolveStayDisplayZone({ source: 'base' }, { baseZone: baseTimeZone('MAO') }).zone, 'America/Manaus');
  assert.equal(resolveStayDisplayZone({ source: 'base' }, { baseZone: baseTimeZone('UNKNOWN') }).zone, '');
  assert.equal(resolveStayDisplayZone({ source: 'local' }).zone, '');
  assert.equal(resolveTimeZoneChoice('local', { strict: true, device: 'America/Sao_Paulo' }).zone, '');
});
test('pickup received at 00:30 in Manaus is local, not Brasilia, even with another hotel context', () => {
  const pickup = normalizePickupLocal({ date: '2030-10-11', clock: '00:30', timeZone: 'America/Manaus' });
  assert.equal(pickup.instant, '2030-10-11T04:30:00.000Z');
  assert.notEqual(pickup.instant, '2030-10-11T03:30:00.000Z');
  assert.equal(presentPickup(pickup, { source: 'local' }, { localZone: 'America/Fortaleza' }).clock, '00:30');
  assert.equal(presentPickup(pickup, { source: 'base' }, { baseZone: baseTimeZone('FOR') }).clock, '01:30');
});
test('display never supplies a missing pickup source zone or repairs conflicting evidence', () => {
  const missing = normalizePickupLocal({ date: '2030-10-11', clock: '05:30' });
  assert.equal(missing.reason, 'pickup-zone-missing');
  for (const source of ['local','base','utc','manual']) assert.equal(presentPickup(missing, { source, manualZone: 'UTC' }, { baseZone: 'UTC', localZone: 'UTC' }).status, 'unavailable');
  const correct = normalizePickupLocal({ date: '2030-10-11', clock: '00:30', timeZone: 'America/Manaus' });
  assert.equal(presentPickup({ ...correct, instant: '2030-10-11T03:30:00Z' }, { source: 'utc' }).reason, 'pickup-source-conflict');
});
test('DST gaps/folds, missing dates and invalid zones never pick an instant silently', () => {
  for (const [date,clock] of [['2026-03-08','02:30'],['2026-11-01','01:30'],['2030-02-30','05:30'],['','05:30']]) {
    assert.equal(normalizePickupLocal({ date, clock, timeZone: 'America/New_York' }).status, 'unavailable');
  }
  assert.equal(normalizePickupLocal({ date: '2026-03-08', clock: '03:30', timeZone: 'America/New_York' }).instant, '2026-03-08T07:30:00.000Z');
});
test('offset labels use event date; source date/zone/instant survive UTC and manual display across midnight', () => {
  assert.match(timeZoneOffsetLabel('Europe/Lisbon','2026-01-15T12:00:00Z'),/^UTC(?:\+00:00)?$/);
  assert.equal(timeZoneOffsetLabel('Europe/Lisbon','2026-07-15T12:00:00Z'),'UTC+01:00');
  assert.equal(timeZoneOffsetLabel('Europe/Lisbon',null),'');
  const pickup = normalizePickupLocal({ date: '2030-10-11', clock: '00:30', timeZone: 'Asia/Tokyo' });
  const before = JSON.stringify(pickup);
  const utc = presentPickup(pickup, { source: 'utc' });
  assert.equal(utc.date,'2030-10-10');assert.equal(utc.clock,'15:30');assert.equal(utc.instant,pickup.instant);
  assert.equal(presentPickup(pickup, { source: 'manual', manualZone: 'Europe/Lisbon' }).instant,pickup.instant);
  assert.equal(JSON.stringify(pickup),before);
  assert.equal(presentStayInstant('2030-10-11T05:30:00','UTC').status,'unavailable');
});
test('account display preference persists independently without changing alarms, source fields or sharing consent', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key,value) => values.set(key,value) };
  const record = { eventId:'stay',signature:'revision',draft:{shareSameHotel:true,presentationTime:'05:30'},apzConfirmed:true,apzSource:'manual',timeZone:'America/Manaus',apzDate:'2030-10-11',breakfastPlan:'with',choice:{mode:'absolute',alarmAt:'2030-10-11T08:00:00Z',timeZone:'America/Manaus'},alarmState:'cancelled' };
  writeStayEditor(storage,'a',{ ...emptyStayEditor('a'),stays:{stay:record} });
  const before=readStayEditor(storage,'a').stays;
  for(const source of ['utc','base','manual','local']) {
    writeStayEditor(storage,'a',{...readStayEditor(storage,'a'),timeZonePreference:{source,manualZone:'Europe/Lisbon'}});
    assert.deepEqual(readStayEditor(storage,'a').stays,before);
    assert.equal(readStayEditor(storage,'a').timeZonePreference.source,source);
    assert.equal(readStayEditor(storage,'b').timeZonePreference.source,'local');
    assert.deepEqual(readStayEditor(storage,'b').stays,{});
  }
});
