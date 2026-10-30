// Station-less ("bare") AIMS activity clocks whose start is ambiguous stay UNRESOLVED end to end.
// "HSB 06:00 09:00": 06:00 is on the legacy duration list, so nothing in the text proves it is the
// start (it may be a duration column). Before this fix the parser dropped it and PROMOTED the next
// clock: a zero-length 09:00–09:00 standby with a "published" start, which the regulatory engine then
// reported as a confirmed "Sobreaviso acima de 12 horas". Contract now:
//  - parser: no 06:00 inference and no 09:00 promotion; report/debrief null with source 'unknown';
//    raw text keeps every original clock; station windows and unambiguous bare clocks are unchanged;
//  - a standby printed before a flight stays its own activity; the flight keeps its own published
//    APZ; no activation is invented (the anonymized official corpus: "não inferir acionamento");
//  - regulation: pending evidence (classification 'dados_insuficientes', actionable false), never a
//    silent 0 h or "compliant", and no standby/reserve limit on an invented window;
//  - finance: no known hours/amount (pending), never 0; presentation shows "—".
// Synthetic text only. Runs on raw and prepared sources (node scripts/v139/apply.mjs). Mutants must
// fail by assertion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const PARSER = 'client/src/lib/aimsParser.ts', ENGINE = 'client/src/lib/complianceEngine.ts';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aims-ambiguous-clocks-'));
let serial = 0;
const EXPOSE = '\nexport { parseAimsHumanBlock, parseAimsVisualColumnDays };\n';
async function load(sources = {}) {
  // Variants are written next to the real modules (same relative imports), bundled, then removed.
  // The parser variant also exposes its two block readers, as regression-aims-activity-before-flight-parity does.
  sources = { [PARSER]: fs.readFileSync(PARSER, 'utf8'), ...sources };
  sources[PARSER] += EXPOSE;
  const written = [], names = {};
  for (const [file, text] of Object.entries(sources)) {
    const variant = path.resolve(path.dirname(file), `.qa-${path.basename(file, '.ts')}-${process.pid}-${serial += 1}.ts`);
    fs.writeFileSync(variant, text); written.push(variant); names[file] = variant;
  }
  const out = path.join(dir, `bundle-${serial += 1}.mjs`);
  try {
    await build({ stdin: { contents: `export { parseAimsRoster, parseAimsHumanBlock, parseAimsVisualColumnDays } from './client/src/lib/aimsParser.ts'; export { buildCanonicalRosterEvents, normalizeRosterDays } from './client/src/lib/canonicalRoster.ts'; export { analyzeCompliance } from './client/src/lib/complianceEngine.ts'; export { assessSalaryActivities } from './client/src/lib/salaryActivityEvidence.ts'; export { rosterCardPresentation } from './client/src/lib/rosterPresentation.ts';`, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
      plugins: [{ name: 'variants', setup(b) {
        b.onResolve({ filter: /(aimsParser|complianceEngine)(\.ts)?$/ }, args => {
          const target = path.resolve(args.resolveDir, args.path.replace(/^@\//, `${path.resolve('client/src')}/`)).replace(/(\.ts)?$/, '.ts');
          const real = Object.keys(names).find(file => path.resolve(file) === target);
          return real ? { path: names[real] } : undefined;
        });
      } }] });
  } finally { for (const file of written) fs.rmSync(file, { force: true }); }
  return import(pathToFileURL(out).href);
}

const header = range => `Escala de Tripulante Convertida para padrão AIMS\nTripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -${range} -Timezone Brasília (-3)\n`;
const PROMOTION_OR_INFERENCE = ['06:00', '09:00', '12:00', '20:00'];

async function suite(P) {
  const parse = line => P.parseAimsRoster(`${header('17/08/2026 até17/08/2026')}\n${line}\n`);
  const day = (roster, type) => { const found = roster.days.find(item => item.date === '17/08/2026' && item.type === type); assert(found, `${type} parsed`); return found; };
  const unresolved = (item, label) => {
    assert.deepEqual([item.dutyReport, item.dutyDebrief], [null, null], `${label}: no start inferred and no later clock promoted`);
    assert.deepEqual([item.dutyReportSource, item.dutyDebriefSource], ['unknown', 'unknown'], `${label}: clocks exist but are not attributed`);
  };

  // Parser: ambiguous bare starts (values on the duration list) stay unresolved.
  for (const [line, type] of [['17Aug Mon HSB 06:00 09:00', 'HSB'], ['17Aug Mon HSBE 03:00 07:00', 'HSBE'], ['17Aug Mon ASB 06:00 12:00', 'ASB'], ['17Aug Mon CRM 06:00 12:00', 'CRM']]) {
    const roster = parse(line);
    unresolved(day(roster, type), line);
    assert.ok(String(roster.rawText || '').includes(line.slice(10)), `${line}: original clocks kept in the roster text`);
  }
  // Clear evidence is unchanged: a station/time window, an unambiguous bare start, a trailing duration.
  const clear = [['17Aug Mon HSB BSB 06:00 BSB 09:00', 'HSB', ['06:00', '09:00']], ['17Aug Mon HSB 05:00 09:00', 'HSB', ['05:00', '09:00']], ['17Aug Mon HSB 05:00 09:00 03:00', 'HSB', ['05:00', '09:00']], ['17Aug Mon ASB BSB 06:00 BSB 12:00', 'ASB', ['06:00', '12:00']]];
  for (const [line, type, window] of clear) {
    const item = day(parse(line), type);
    assert.deepEqual([item.dutyReport, item.dutyDebrief, item.dutyReportSource, item.dutyDebriefSource], [...window, 'published', 'published'], `${line}: clear published window unchanged`);
  }

  // Standby printed before a flight: separate activity, flight keeps its own APZ, no activation invented.
  const mixed = parse('17Aug Mon HSB 06:00 09:00 LA 3730 09:25 10:15 BSB FOR 12:55');
  const standby = day(mixed, 'HSB');
  unresolved(standby, 'standby before a flight');
  assert.deepEqual(standby.legs, [], 'no flight is attached to the standby (no activation inferred)');
  assert.match(String(standby.rawText || ''), /HSB 06:00 09:00/, 'the standby keeps its own original text');
  const flight = mixed.days.find(item => (item.legs || []).some(leg => leg.flightNumber === 'LA3730'));
  assert.deepEqual([flight.type, flight.dutyReport, flight.dutyReportSource, flight.legs[0].departureTime], ['VOO', '09:25', 'published', '10:15'], 'the flight keeps its own published presentation');
  const clearMixed = parse('17Aug Mon HSB BSB 06:00 BSB 09:00 LA 3730 09:25 10:15 BSB FOR 12:55');
  assert.deepEqual([day(clearMixed, 'HSB').dutyReport, day(clearMixed, 'HSB').dutyDebrief], ['06:00', '09:00'], 'with stations the standby window is published and kept');

  // Each block reader on its own (the public path merges both, so each guard is checked directly).
  const context = { date: '17/08/2026', dayOfWeek: 'Seg', dateObj: new Date(2026, 7, 17), base: 'BSB' };
  for (const tokens of [['HSB', '06:00', '09:00'], ['HSB', '06:00', '09:00', 'LA', '3730', '09:25', '10:15', 'BSB', 'FOR', '12:55'], ['ASB', '06:00', '12:00'], ['ASB', '06:00', '20:00', 'LA', '3730', '20:25', '21:15', 'BSB', 'FOR', '23:55'], ['CRM', '06:00', '12:00']]) {
    for (const [name, read] of [['human', P.parseAimsHumanBlock], ['visual', P.parseAimsVisualColumnDays]]) {
      const days = read(tokens, { ...context, rawBlock: tokens.join(' ') });
      const activity = days.find(item => !(item.legs || []).length);
      assert(activity, `${name} reader returns the activity for ${tokens.join(' ')}`);
      assert.deepEqual([activity.dutyReport, activity.dutyDebrief], [null, null], `${name} reader: ${tokens.join(' ')} unresolved`);
    }
  }

  // Canonical + presentation: the unresolved standby is never shown with invented clocks.
  const isolated = parse('17Aug Mon HSB 06:00 09:00');
  const events = P.buildCanonicalRosterEvents(P.normalizeRosterDays(isolated));
  const duty = events.find(event => event.kind === 'duty');
  assert.notEqual(duty.startDateTime, duty.endDateTime, 'no zero-length standby interval');
  const card = P.rosterCardPresentation(duty);
  for (const clock of PROMOTION_OR_INFERENCE) assert.ok(!JSON.stringify(card).includes(clock), `card shows no ${clock}`);

  // Regulation: pending evidence, never a silent 0 h / compliant, never rebuilt from rawText.
  const compliance = roster => P.analyzeCompliance(JSON.parse(JSON.stringify(roster)), 'cabin');
  const codes = result => result.alerts.map(alert => alert.code || alert.title);
  const standbyResult = compliance(isolated);
  const pending = standbyResult.alerts.find(alert => alert.code === 'STANDBY_WINDOW_UNRESOLVED');
  assert.ok(pending, 'unresolved standby window is reported');
  assert.deepEqual([pending.classification, pending.actionable, pending.date], ['dados_insuficientes', false, '17/08/2026']);
  assert.notEqual(standbyResult.overallStatus, 'compliant', 'never a silent compliant');
  assert.ok(!codes(standbyResult).some(code => /^Sobreaviso (acima|abaixo)/.test(code)), 'no confirmed standby violation from a zero-length or invented window');
  const reserveResult = compliance(parse('17Aug Mon ASB 06:00 20:00 LA 3730 20:25 21:15 BSB FOR 23:55'));
  assert.ok(codes(reserveResult).includes('RESERVE_WINDOW_UNRESOLVED'), 'unresolved reserve window is reported');
  assert.ok(!codes(reserveResult).some(code => /^Reserva (acima|abaixo)/.test(code)), 'no reserve limit evaluated on an invented window');
  assert.ok(!codes(compliance(parse('17Aug Mon HSB BSB 06:00 BSB 09:00'))).includes('STANDBY_WINDOW_UNRESOLVED'), 'a published window raises no pending item');

  // Finance: unknown is pending, never 0.
  const salary = P.assessSalaryActivities([{ id: 'standby-1', kind: 'standby', day: day(isolated, 'HSB') }], () => 3, 10);
  assert.deepEqual([salary.rows[0].timeKnown, salary.rows[0].hours, salary.complete, Number.isNaN(salary.amount)], [false, null, false, true], 'standby pay pending, not zero');
}

const parserSource = fs.readFileSync(PARSER, 'utf8'), engineSource = fs.readFileSync(ENGINE, 'utf8');
await suite(await load());

const mutants = [
  ['parser promotes the next clock (09:00) again (ambiguity ignored)', PARSER, "  return Boolean(first) && looksLikeDuration(normalizeSimpleTime(first!));", '  return false && Boolean(first);'],
  ['parser infers the ambiguous first clock (06:00) as published start', PARSER, "function looksLikeDuration(time: string): boolean {\n", "function looksLikeDuration(time: string): boolean {\n  return false;\n"],
  ['HSB/HSBE reader without the guard', PARSER, "  if (!published && bareActivityStartIsAmbiguous(ownLines)) return unresolvedActivityWindow(type);\n", ''],
  ['ASB/RES reader without the guard', PARSER, "  if (!published && bareActivityStartIsAmbiguous(ownLines)) return unresolvedActivityWindow('ASB');\n", ''],
  ['ground/visual window without the guard', PARSER, "  if (bareActivityStartIsAmbiguous(tokens)) return { start: null, end: null, startSource: 'unknown', endSource: 'unknown' };\n", ''],
  ['compliance treats the unresolved reserve as silent 0 h', ENGINE, "      if (activityWindowUnresolved(day)) pushAlert(alerts, unresolvedActivityWindowAlert(day, 'Reserva', 'RESERVE_WINDOW_UNRESOLVED', actRules.reserve.legalReference));\n", ''],
  ['compliance treats the unresolved standby as silent 0 h', ENGINE, "      if (activityWindowUnresolved(day)) pushAlert(alerts, unresolvedActivityWindowAlert(day, 'Sobreaviso', 'STANDBY_WINDOW_UNRESOLVED', actRules.standby.legalReference));\n", ''],
];
const killed = [];
for (const [name, file, from, to] of mutants) {
  const source = file === PARSER ? parserSource : engineSource;
  assert(source.includes(from), `mutant anchor present: ${name}`);
  let failure = null;
  try { await suite(await load({ [file]: source.replace(from, to) })); } catch (error) { failure = error; }
  if (!(failure instanceof assert.AssertionError)) console.error(name, failure);
  assert(failure instanceof assert.AssertionError, `mutant must be killed by an assertion: ${name} (${failure?.message || 'survived'})`);
  killed.push(`${name} → "${failure.message.split('\n')[0]}"`);
}
const prepared = /\|MCK\|/.test(parserSource);
console.log(`PASS ambiguous bare activity clocks (${prepared ? 'prepared' : 'raw'} sources): HSB/HSBE/ASB/ground with an ambiguous bare start stay unresolved (no 06:00 inference, no 09:00 promotion, raw kept); station and unambiguous windows unchanged; standby before a flight stays separate and the flight keeps APZ 09:25 with no activation invented; canonical/presentation show no invented clock; regulation reports pending evidence (never silent 0 h/compliant, no limit on an invented window); finance pending, not zero; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
