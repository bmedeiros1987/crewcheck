import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules } from './lib/ts-module-harness.mjs';

// Synthetic identity, flight numbers and year. Never load the private PDF.
const h = loadClientModules({
  files: ['client/src/lib/aimsParser.ts', 'client/src/lib/complianceEngine.ts',
    'client/src/lib/rollingFlightHours.ts', 'client/src/lib/canonicalRoster.ts',
    'client/src/lib/canonicalDutyMeasurement.ts'],
  expose: { aimsParser: ['extractAimsPhysicalLegs'],
    complianceEngine: ['getFlightHours', 'getAirTravelHours', 'getOperationalLoadHours'] },
  prefix: 'synthetic-operated-flight-',
});
try {
  const parser = h.load('aimsParser'), engine = h.load('complianceEngine');
  const kernel = h.load('rollingFlightHours'), canonical = h.load('canonicalRoster');
  const duty = h.load('canonicalDutyMeasurement');
  const home = ts.createSourceFile('Home.tsx', fs.readFileSync('client/src/pages/Home.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const payrollRules = home.statements.filter(n => ts.isFunctionDeclaration(n) && ['flightWorkType', 'financialFlightRule'].includes(n.name?.text));
  assert.equal(payrollRules.length, 2);
  const currentNode = home.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'currentCompliance');
  assert.ok(currentNode);
  const presentation = vm.createContext({ analyzeSafe: r => engine.analyzeCompliance(r), neutralCompliance: () => null });
  vm.runInContext(ts.transpileModule(currentNode.getText(home) + '\nglobalThis.current=currentCompliance;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, presentation);

  const payroll = vm.createContext({ financialEventCode: e => e.code || 'OP' });
  vm.runInContext(ts.transpileModule(payrollRules.map(n => n.getText(home)).join('\n') + '\nglobalThis.rule=financialFlightRule;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, payroll);
  const mixed = ['LA 9001 04:10 05:00 BSB CGH 06:45 (320)',
    '[extra] LA 9002 07:30 CGH CNF 08:45 (320)',
    'LA 9003 09:30 CNF CGH 10:55 11:25 (328)'].join('\n');
  const second = ['LA 9011 06:05 06:35 CGH SSA 08:55 (328)',
    'LA 9012 09:40 SSA GRU 12:10 (328)',
    '[extra] LA 9013 12:55 GRU CWB 14:00 14:30'].join('\n');
  const text = 'Escala de Tripulante Convertida para padrão AIMS\n'
    + 'Tripulante: SYNTHETIC CREW - BP: 99999999 - Base: BSB - 01/10/2032 até 31/10/2032\n'
    + `20Oct Tue\n${mixed}\n21Oct Wed\n${second}\n`
    + [22, 23, 24, 25].map(n => `${n}Oct Thu\nLA 90${n} 08:00 09:00 BSB GRU 10:00 10:30`).join('\n')
    + '\n' + [26, 27, 28, 29, 30, 31].map(n => `${n}Oct Thu\nDO`).join('\n')
    + '\nTimezone -3 : Brasília';
  const results = [];
  for (const timezone of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
    process.env.TZ = timezone;
    const physical = parser.extractAimsPhysicalLegs(text, 'BSB', 10, 2032);
    assert.deepEqual(physical.slice(0, 6).map(x => x.leg.workType), ['OP', 'PS', 'OP', 'OP', 'OP', 'PS']);
    const parsed = parser.parseAimsRoster(text);
    const days = parsed.days.filter(d => ['20/10/2032', '21/10/2032'].includes(d.date));
    assert.equal(days.length, 2);
    assert.deepEqual(days.map(d => d.legs.map(l => l.workType)), [['OP', 'PS', 'OP'], ['OP', 'OP', 'PS']]);
    assert.deepEqual(days.map(d => engine.getFlightHours(d)), [3.2, 4.8]);
    assert.deepEqual(days.map(d => engine.getAirTravelHours(d)), [4.4, 5.9]);
    assert.equal(Math.round(days.flatMap(d => d.legs).filter(l => l.workType === 'PS').reduce((s, l) => s + l.duration * 60, 0)), 140);
    assert.deepEqual(days.map(d => [d.dutyReport, d.dutyDebrief]), [['04:10', '11:25'], ['06:05', '14:30']]);
    // Explicit provenance is synthetic test input; it is not inferred for imports.
    const roster = { ...parsed, days: days.map(d => ({ ...d, dutyReportSource: 'published', dutyDebriefSource: 'published' })) };
    const events = canonical.buildCanonicalRosterEvents(roster).filter(e => e.kind === 'flight');
    assert.equal(events.length, 6, 'PS remains a canonical flight event and payroll input');
    assert.equal(canonical.buildCanonicalRosterEvents({ ...roster, days: [...roster.days, ...roster.days] }).filter(e => e.kind === 'flight').length, 6, 'duplicate import does not duplicate canonical legs');
    assert.equal(payroll.rule({ leg: { workType: 'PS' } }).extra, true, 'actual payroll caller retains PS extra tariff eligibility');
    assert.equal(payroll.rule({ leg: { workType: 'OP' }, code: 'DFS' }).extra, true, 'DFS payroll eligibility remains independent of operated role');
    assert.equal(payroll.rule({ leg: { workType: 'OP' } }).extra, false);
    const spans = days.map(d => duty.measureCanonicalDuty(events, events.find(e => e.date === d.date || e.date === '2032-10-' + d.date.slice(0, 2)).id));
    assert.deepEqual(spans.map(s => s.minutes), [435, 505]);
    assert.deepEqual(spans.map(s => s.groundMinutes), [90, 90]);
    const untouched = JSON.stringify(roster);
    const legacy = JSON.parse(untouched);
    legacy.days.forEach(d => d.legs.forEach(l => delete l.workTypeSource));
    const beforeLegacy = JSON.stringify(legacy);
    const legacyReport = engine.analyzeCompliance(legacy);
    assert.equal(legacyReport.metrics.totalFlightHours, null);
    assert.equal(legacyReport.metrics.maxFlightHoursRolling28Days, null);
    assert.equal(legacyReport.metrics.maxFlightHoursRolling365Days, null);
    assert.equal(legacyReport.metrics.flightHoursOriginPending, true);
    assert.equal(legacyReport.metrics.flightHoursRolling365Complete, false);
    assert.ok(legacyReport.alerts.some(a => a.code === 'FLIGHT_ROLE_ORIGIN_PENDING' && a.actionable === false));
    assert.ok(legacyReport.loadAnalysis.days.every(d => d.flightHours === null));
    assert.equal(JSON.stringify(legacy), beforeLegacy, 'analysis does not rewrite old roles or real records');
    assert.equal(presentation.current({ roster: legacy, compliance: { metrics: { totalFlightHours: 777 } } }).metrics.totalFlightHours, null, 'actual presentation consumer refuses old cached/server compliance without origin state');
    const lostRoles = { ...legacy, days: legacy.days.map(d => ({ ...d, legs: d.legs.map(l => ({ ...l, workType: 'OP' })) })) };
    assert.equal(engine.analyzeCompliance(lostRoles).metrics.totalFlightHours, null, 'raw extra marker without verified leg origin remains pending');
    const undatedLegacy = { ...legacy, days: legacy.days.map(d => ({ ...d, date: 'invalid' })) };
    assert.equal(engine.analyzeCompliance(undatedLegacy).metrics.totalFlightHours, null, 'unassignable legacy extra cannot be reported as a precise zero');
    const aggregateLegacy = { ...legacy, days: legacy.days.map(d => ({ ...d, legs: [], flyingHours: 2 })) };
    assert.equal(engine.analyzeCompliance(aggregateLegacy).metrics.totalFlightHours, null, 'aggregate-only extra source cannot establish operated hours');
    const inflatedLegacy = { ...legacy, days: legacy.days.map(d => ({ ...d, legs: d.legs.map(l => ({ ...l, duration: 100 })) })) };
    assert.ok(!engine.analyzeCompliance(inflatedLegacy).alerts.some(a => ['Horas de voo: revisar base de cálculo', 'Limite de 28 dias de horas de voo excedido', 'Horas de voo próximas do limite de 28 dias'].includes(a.title)), 'unverified role totals cannot claim flight-limit evidence');
    const report = engine.analyzeCompliance(roster);
    assert.equal(JSON.stringify(roster), untouched);
    assert.equal(report.metrics.flightHoursOriginPending, false);
    assert.ok(report.loadAnalysis.days.every(d => typeof d.fatigueScore === 'number'));

    assert.equal(report.metrics.totalFlightHours, 8);
    assert.equal(report.metrics.maxFlightHoursRolling28Days, 8);
    assert.equal(report.metrics.maxFlightHoursRolling365Days, 8);
    assert.equal(report.metrics.flightHoursRolling365Complete, false, 'missing annual history is never complete');
    const asOp = { ...roster, days: roster.days.map(d => ({ ...d, legs: d.legs.map(l => ({ ...l, workType: 'OP' })) })) };
    const allReport = engine.analyzeCompliance(asOp);
    assert.equal(report.metrics.totalDutyHours, allReport.metrics.totalDutyHours);
    assert.equal(report.metrics.totalGroundHours, allReport.metrics.totalGroundHours);
    assert.deepEqual(report.loadAnalysis.days.map(d => [d.fatigueScore, d.sectors, d.dutyHours]), allReport.loadAnalysis.days.map(d => [d.fatigueScore, d.sectors, d.dutyHours]));
    assert.deepEqual(days.map(d => engine.getOperationalLoadHours(d)), asOp.days.map(d => engine.getOperationalLoadHours(d)));
    const allPs = { ...days[0], legs: days[0].legs.map(l => ({ ...l, workType: ' ps ' })) };
    assert.equal(engine.getFlightHours(allPs), 0);
    assert.ok(engine.getOperationalLoadHours(allPs) > 0, 'all-PS day remains work');
    for (const code of ['OP', 'DH', 'DFS', undefined]) {
      assert.equal(engine.getFlightHours({ ...allPs, pairingCode: 'EXTRA DFS', legs: allPs.legs.map(l => ({ ...l, workType: code })) }), 4.4, 'only verified structured PS is excluded');
    }
    assert.equal(engine.getFlightHours({ ...allPs, legs: [], flyingHours: 2 }), 2, 'aggregate-only fallback preserved');
    const active = days.map(d => ({ date: d.date, hours: engine.getFlightHours(d) }));
    const adjacent = [{ date: '30/09/2032', hours: 2 }, ...active];
    const historicalDay = { ...roster.days[0], date: '30/09/2032', month: 9 };
    const historical = engine.analyzeCompliance(roster, 'auto', [{ ...roster, month: 9, days: [historicalDay] }]);
    const oldHistory = JSON.parse(JSON.stringify(historicalDay));
    oldHistory.legs.forEach(l => delete l.workTypeSource);
    const pendingHistory = engine.analyzeCompliance(roster, 'auto', [{ ...roster, month: 9, days: [oldHistory] }]);
    assert.equal(pendingHistory.metrics.totalFlightHours, 8, 'active origin remains verified');
    assert.equal(pendingHistory.metrics.maxFlightHoursRolling28Days, null);
    assert.equal(pendingHistory.metrics.maxFlightHoursRolling365Days, null);
    assert.equal(pendingHistory.metrics.flightHoursOriginPending, true);
    const olderHistory = { ...oldHistory, date: '01/01/2032', month: 1 };
    const annualOnlyPending = engine.analyzeCompliance(roster, 'auto', [{ ...roster, month: 1, days: [olderHistory] }]);
    assert.equal(annualOnlyPending.metrics.totalFlightHours, 8);
    assert.equal(annualOnlyPending.metrics.maxFlightHoursRolling28Days, 8);
    assert.equal(annualOnlyPending.metrics.maxFlightHoursRolling365Days, null, 'origin uncertainty is scoped to the relevant window');
    assert.equal(historical.metrics.totalFlightHours, 8);
    assert.equal(historical.metrics.maxFlightHoursRolling28Days, 11.2);
    assert.equal(historical.metrics.maxFlightHoursRolling365Days, 11.2);
    const carryIn = { ...roster, days: [historicalDay, ...roster.days] };
    const withOverlap = engine.analyzeCompliance(carryIn, 'auto', [{ ...roster, month: 9, days: [historicalDay] }]);
    assert.equal(withOverlap.metrics.totalFlightHours, 8);
    assert.equal(withOverlap.metrics.maxFlightHoursRolling28Days, 11.2, 'active carry-in wins over historical duplicate');
    assert.equal(kernel.sumFlightHoursForCompetence(adjacent, 10, 2032), 8);
    assert.equal(kernel.maxFlightHoursRolling28Days(adjacent), 10);
    assert.equal(kernel.maxFlightHoursRolling28Days([{ date: '01/01/2032', hours: 4 }, { date: '28/01/2032', hours: 3 }]), 7);
    assert.equal(kernel.maxFlightHoursRolling28Days([{ date: '01/01/2032', hours: 4 }, { date: '29/01/2032', hours: 3 }]), 4);
    assert.equal(kernel.maxFlightHoursRolling365Days([{ date: '01/01/2031', hours: 4 }, { date: '31/12/2031', hours: 3 }]), 7);
    assert.equal(kernel.maxFlightHoursRolling365Days([{ date: '01/01/2031', hours: 4 }, { date: '01/01/2032', hours: 3 }]), 4);
    const coverage = Array.from({ length: 365 }, (_, i) => ({ date: new Date(Date.UTC(2031, 0, 2 + i)).toISOString().slice(0, 10).split('-').reverse().join('/'), hours: 0 }));
    assert.equal(kernel.assessFlightHoursRolling365Days(coverage, 1, 2032).complete, true);
    assert.equal(kernel.assessFlightHoursRolling365Days(coverage.slice(1), 1, 2032).complete, false);
    assert.equal(kernel.maxFlightHoursRolling365Days([{ date: '31/02/2032', hours: 999 }]), 0);
    results.push({ timezone, synthetic: true, operated: 8, airTravel: 10.3, extraMinutes: 140,
      dutyMinutes: spans.map(s => s.minutes), groundMinutes: spans.map(s => s.groundMinutes), canonicalEvents: events.length });
  }
  fs.mkdirSync('artifacts/operated-flight-hours', { recursive: true });
  fs.writeFileSync('artifacts/operated-flight-hours/report.json', JSON.stringify({ synthetic: true, results }, null, 2));
  console.log('PASS operated-flight counters, full AIMS/physical parser, 140min PS, preserved work/ground/load/sectors, civil vs28/365 boundaries and unknown coverage in3TZ');
} finally { h.cleanup(); }
