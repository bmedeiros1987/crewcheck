import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const zones = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo'];
if (!process.argv.includes('--child')) {
  const failures = [];
  for (const zone of zones) {
    const scripts = process.argv.includes('--helpers-only') ? [fileURLToPath(import.meta.url)] : [fileURLToPath(import.meta.url), 'scripts/regression-v14-3-74-for-cgh.mjs'];
    for (const script of scripts) {
      const args = script === fileURLToPath(import.meta.url) ? [script, '--child'] : [script];
      const result = spawnSync(process.execPath, args, { env: { ...process.env, TZ: zone }, encoding: 'utf8' });
      console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${zone} ${script.split('/').at(-1)}`);
      if (result.status !== 0) failures.push(`${zone}: ${result.stderr || result.stdout}`);
    }
  }
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(process.argv.includes('--helpers-only')
    ? 'PASS: actual AIMS civil helpers in three independent timezone processes.'
    : 'PASS: actual AIMS civil helpers and FOR-CGH fixture in three independent timezone processes.');
} else {
  const harness = loadClientModules({
    files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/aimsParser.ts'],
    stubs: TYPE_ONLY_PDF_PARSER_STUB,
    expose: { aimsParser: ['aimsPhysicalDaySerial', 'dateFromAimsPhysicalAbs', 'attachAimsPhysicalAbs', 'buildAimsPhysicalFlightDays'] },
    prefix: 'crewcheck-aims-civil-',
  });
  try {
    const aims = harness.load('aimsParser');
    const civil = date => [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    for (const [year, month, day] of [[2026, 8, 1], [2026, 1, 1], [2026, 12, 31], [2028, 2, 29], [2018, 11, 4]]) {
      const date = new Date(year, month - 1, day);
      const serial = aims.aimsPhysicalDaySerial(date);
      assert.equal(serial, Math.floor(Date.UTC(year, month - 1, day) / 86400000), 'civil ordinal must not depend on the host offset');
      for (const deltaMinutes of [-30, 0, 1439, 1470]) {
        const ordinalDate = new Date((serial + Math.floor(deltaMinutes / 1440)) * 86400000);
        assert.deepEqual(civil(aims.dateFromAimsPhysicalAbs(serial * 1440 + deltaMinutes)), [ordinalDate.getUTCFullYear(), ordinalDate.getUTCMonth() + 1, ordinalDate.getUTCDate()], 'decode retains the civil day across midnight/month/year/leap/DST boundaries');
      }
    }
    const roster = { base: 'BSB', month: 8, year: 2026 };
    const physical = (date, flightNumber, origin, destination, report, departure, arrival, debrief) => {
      const item = aims.attachAimsPhysicalAbs({ leg: { flightNumber, origin, destination, departureTime: departure, arrivalTime: arrival, workType: 'OP' }, reportTime: report, debriefTime: debrief }, date);
      assert.ok(item);
      return item;
    };
    for (const date of [new Date(2026, 7, 31), new Date(2026, 11, 31)]) {
      const overnight = physical(date, 'LA9001', 'BSB', 'GRU', '23:05', '23:35', '01:10', '01:40');
      const [duty] = aims.buildAimsPhysicalFlightDays([overnight], roster);
      assert.equal(duty.date, `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`);
      assert.equal(duty.isNextDay, true);
      assert.equal(duty.dutyReport, '23:05'); assert.equal(duty.dutyDebrief, '01:40');
      assert.equal(duty.dutyHours, 2.58); assert.equal(duty.flyingHours, 1.58);
    }
    // Presentation on the previous civil day, departure after midnight.
    const presentedBeforeMidnight = physical(new Date(2027, 0, 1), 'LA9002', 'BSB', 'GRU', '23:40', '00:20', '02:00', '02:30');
    const [previousDayDuty] = aims.buildAimsPhysicalFlightDays([presentedBeforeMidnight], roster);
    assert.equal(previousDayDuty.date, '31/12/2026'); assert.equal(previousDayDuty.dutyReport, '23:40');
    assert.equal(previousDayDuty.dutyDebrief, '02:30'); assert.equal(previousDayDuty.isNextDay, true);
    // Two presentations on one civil day remain separate after proven >=12h rest.
    const date = new Date(2026, 7, 1);
    const duties = aims.buildAimsPhysicalFlightDays([
      physical(date, 'LA9003', 'BSB', 'GRU', '00:10', '00:40', '02:00', '02:30'),
      physical(date, 'LA9004', 'GRU', 'BSB', '16:00', '16:30', '18:00', '18:30'),
    ], roster);
    assert.deepEqual(duties.map(day => [day.date, day.dutyReport]), [['01/08/2026', '00:10'], ['01/08/2026', '16:00']]);
    assert.deepEqual(duties.map(day => day.legs.map(leg => leg.flightNumber)), [['LA9003'], ['LA9004']]);
  } finally { harness.cleanup(); }
}
