import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const modules = loadClientModules({ files: ['client/src/lib/financialAmounts.ts',
  'client/src/lib/financialStatementLearning.ts', 'client/src/lib/financialJourneyGrouping.ts',
  'client/src/lib/compensationPolicy.ts', 'client/src/lib/financialForecastPeriods.ts'], prefix: 'synthetic-finance-callers-' });
try {
  const amounts = modules.load('financialAmounts');
  const learning = modules.load('financialStatementLearning');
  const grouping = modules.load('financialJourneyGrouping');
  const compensation = modules.load('compensationPolicy');
  const periods = modules.load('financialForecastPeriods');
  const home = process.env.FINANCIAL_BASELINE_SHA
    ? execFileSync('git', ['show', process.env.FINANCIAL_BASELINE_SHA + ':client/src/pages/Home.tsx'], { encoding: 'utf8' })
    : fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['rosterFinancialDate', 'perDiemConfig', 'calculatePerDiem', 'PerDiemView', 'moneyBRL', 'moneyCurrency'];
  const functions = ast.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text));
  assert.equal(functions.length, names.length, 'extract actual production caller functions');
  const learned = ['lunch', 'breakfast'].map((slot, i) => ({ key: 'per_diem.' + slot,
    value: i ? 43.75 : 175, confirmed: true, effectiveFrom: '2032-08-05', effectiveTo: '2032-09-01' }));
  const consultedDates = [];
  let activeEvents = [];
  let fxUSD = 0;
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const context = vm.createContext({ React, ...amounts, ...grouping, ...compensation, ...periods,
    useMemo: React.useMemo, useState: React.useState,
    resolveActFinancialRules: () => ({ profileLabel: 'Synthetic rules, not a real tariff', legalReference: 'synthetic-v1',
      breakfastPercent: 0.25, perDiem: [
        { key: 'domestic', label: 'Synthetic domestic', currency: 'BRL', mainMeal: 100 },
        { key: 'other_international', label: 'Synthetic foreign', currency: 'USD', mainMeal: 20 },
      ] }),
    confirmedRateValueAt: (key, date) => { consultedDates.push(date); return learning.rateAt(learned, key, date)?.value ?? null; },
    readOptionalNumberSetting: () => null,
    readNumberSetting: key => key === 'crewcheck_fx_usd_brl' ? fxUSD : 0,
    loadAirportPerDiemOverrides: () => ({}),
    resolvePerDiemRule: origin => ({ rateKey: origin === 'UNKNOWN' ? null : origin === 'INT' ? 'other_international' : 'domestic', airport: origin, reason: 'synthetic fixture' }),
    isOperationalEvent: () => true,
    financialEventCode: () => 'CRM',
    eventStartDateTime: event => new Date(event.start), eventEndDateTime: event => new Date(event.end),
    dateChip: iso,
    buildLegs: () => activeEvents,
    Brand: () => React.createElement('header'),
    KpiCard: props => React.createElement('article', null, props.title, ': ', props.value, ' — ', props.detail),
    BriefcaseBusiness: () => null, CalendarDays: () => null, Plane: () => null, DollarSign: () => null,
  });
  const compiled = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n')
    + '\nglobalThis.subject = { perDiemConfig, calculatePerDiem, PerDiemView };',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInContext(compiled, context);
  const { calculatePerDiem, PerDiemView } = context.subject;
  const event = (date, origin = 'BRL') => ({ id: 'synthetic-' + date + '-' + origin,
    date: new Date(date + 'T11:00:00'), start: date + 'T11:00:00', end: date + 'T11:15:00',
    kind: 'training', origin, destination: origin, day: {} });
  const roster = (year, month) => ({ year, month, base: 'TEST' });

  const datedEvents = ['2032-08-02', '2032-08-05', '2032-08-31', '2032-09-01', '2032-09-02'].map(date => event(date));
  const dated = calculatePerDiem(datedEvents, roster(2032, 8), new Date('2032-08-06T12:00:00'));
  assert.deepEqual(Array.from(dated.rows, row => row.value), [100, 175, 175, 175, 100]);
  assert.equal(dated.monthly, 450);
  assert.ok(consultedDates.includes('2032-08-31') && consultedDates.includes('2032-09-02'));
  assert.ok(!consultedDates.includes('2032-08-01'), 'no month anchor substitutes for the actual item date');
  assert.ok(dated.rows.every(row => row.source.includes(row.iso)), 'item provenance carries queried effective date');
  const inherited = amounts.DEMONSTRATED_DOMESTIC_EFFECTIVE_FROM;
  const inheritedEnd = amounts.DEMONSTRATED_DOMESTIC_EFFECTIVE_TO;
  // Existing demonstrated resolver is exercised at its real boundaries without
  // copying private money figures into a new fixture or creating a tariff.
  assert.equal(context.subject.perDiemConfig(roster(2026, 8), inherited).domesticMainMealSource, 'demonstrated');
  const after = new Date(inheritedEnd + 'T12:00:00'); after.setDate(after.getDate() + 1);
  assert.equal(context.subject.perDiemConfig(roster(2026, 9), iso(after)).domesticMainMealSource, 'act');
  const night = { ...event('2032-09-01'), kind: 'flight', presentation: '23:50',
    start: '2032-09-01T23:50:00', end: '2032-09-02T00:30:00', canonical: { journeyId: 'synthetic-night' } };
  const nightResult = calculatePerDiem([night], roster(2032, 9), new Date('2032-09-02T12:00:00'));
  assert.equal(nightResult.rows[0].iso, '2032-09-02');
  assert.equal(nightResult.rows[0].date, '2032-09-02', 'visible date follows occurrence date after midnight');
  assert.equal(nightResult.rows[0].value, 100, 'post-midnight occurrence does not reuse the expired prior-day rate');

  const cross = calculatePerDiem([event('2032-01-31', 'INT'), event('2032-02-01')], roster(2032, 2), new Date('2032-02-02T12:00:00'));
  assert.equal(cross.monthlySummary.convertedComplete, true);
  assert.equal(cross.monthly, 100);
  assert.equal(cross.weeklyRows.length, 2);
  assert.equal(cross.weekly, null);
  assert.deepEqual(Array.from(cross.weeklySummary.pendingCurrencies), ['USD']);
  const reverse = calculatePerDiem([event('2032-01-31'), event('2032-02-01', 'INT')], roster(2032, 1), new Date('2032-02-02T12:00:00'));
  assert.equal(reverse.monthly, 100);
  assert.equal(reverse.weekly, null);
  const outside = calculatePerDiem([event('2032-01-15', 'INT'), event('2032-01-29')], roster(2032, 1), new Date('2032-01-29T12:00:00'));
  assert.equal(outside.monthly, null);
  assert.equal(outside.weekly, 100);
  assert.equal(outside.weeklySummary.convertedComplete, true);
  fxUSD = 2;
  assert.equal(calculatePerDiem([event('2032-01-31', 'INT'), event('2032-02-01')], roster(2032, 2), new Date('2032-02-02T12:00:00')).weekly, 140);
  fxUSD = 0;
  assert.equal(calculatePerDiem([event('2032-02-01', 'UNKNOWN')], roster(2032, 2), new Date('2032-02-02T12:00:00')).weeklySummary.state, 'unclassified');
  const empty = calculatePerDiem([], roster(2032, 2), new Date('2032-02-02T12:00:00'));
  assert.equal(empty.monthly, null);
  assert.equal(empty.weekly, null);
  assert.equal(empty.configured, false);

  const mixedEvents = [event('2032-02-01'), event('2032-02-02', 'UNKNOWN')];
  const mixed = calculatePerDiem(mixedEvents, roster(2032, 2), new Date('2032-02-02T12:00:00'));
  assert.equal(mixed.monthly, null);
  assert.equal(mixed.currencySummary, 'Não calculável');
  assert.deepEqual(Object.keys(mixed.totalsByCurrency), []);
  assert.equal(mixed.nativeSummary.complete, false);
  const originalRate = context.readOptionalNumberSetting;
  context.readOptionalNumberSetting = key => key === 'crewcheck_perdiem_rate_other_international' ? NaN : null;
  const invalidRate = calculatePerDiem([event('2032-02-01'), event('2032-02-02', 'INT')], roster(2032, 2));
  assert.equal(invalidRate.nativeSummary.complete, false);
  assert.equal(invalidRate.currencySummary, 'Não calculável');
  context.readOptionalNumberSetting = originalRate;
  const foreign = calculatePerDiem([event('2032-02-01', 'INT')], roster(2032, 2));
  assert.equal(foreign.monthly, null);
  assert.equal(foreign.nativeSummary.complete, true, 'missing FX does not suppress valid native total');
  assert.match(foreign.currencySummary, /20/);
  const native = periods.summarizeNativeForecastRows;
  assert.equal(native([{iso:'2032-02-01',currency:'BRL',value:Infinity,convertedBRL:null}]).complete, false);
  const compareFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CompareRosterView');
  const actualCompareStatements = [];
  function findCompare(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ['financial', 'perDiemDeltaText'].includes(decl.name.getText(ast)))) actualCompareStatements.push(node.getText(ast));
    ts.forEachChild(node, findCompare);
  }
  findCompare(compareFunction);
  assert.equal(actualCompareStatements.length, 2);
  const comparisonCode = ts.transpileModule(actualCompareStatements.join('\n') + '\nglobalThis.comparisonText = perDiemDeltaText;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const salary = {production:0,reserve:0,standby:0,chief:0,instructorPay:0,config:{requiresManualFunction:false}};
  for (const [before, after, expected] of [[mixed, foreign, 'Não calculável'], [foreign, invalidRate, 'Não calculável'], [empty, foreign, 'Não calculável'], [foreign, foreign, 'Sem diferença']]) {
    const c = vm.createContext({...periods, useMemo: f=>f(), planned:{roster:'before'},bundle:{roster:'after'},comparison:{summary:{periodMatches:true}},financeSnapshot:r=>({salary,perdiem:r==='before'?before:after}),moneyCurrency:()=>{throw Error('unavailable delta must never be formatted as a monetary total');}});
    vm.runInContext(comparisonCode,c); assert.equal(c.comparisonText,expected);
  }
  // Compact roster and detailed view share the completeness-aware display string.
  const rosterFunction = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'Roster');
  let compactExpression;
  function findCompact(node) {
    if (ts.isJsxExpression(node) && node.expression?.getText(ast).includes('finance.perdiem.currencySummary')) compactExpression=node.expression.getText(ast);
    ts.forEachChild(node,findCompact);
  }
  findCompact(rosterFunction); assert.ok(compactExpression);
  for(const candidate of [mixed,invalidRate,empty,foreign]) {
    assert.equal(vm.runInNewContext(compactExpression,{finance:{perdiem:candidate}}),candidate.currencySummary);
  }
  activeEvents = mixedEvents;
  const mixedHtml = renderToStaticMarkup(React.createElement(PerDiemView,{bundle:{roster:roster(2032,2)}}));
  assert.match(mixedHtml,/Totais por moeda: Não calculável/);
  assert.doesNotMatch(mixedHtml,/Totais por moeda: [^<]*R\$ 100,00/);

  const october = periods.observedAllowancePeriods(new Date('2026-10-08T12:00:00'));
  assert.equal(iso(october.accumulation.start), '2026-10-07');
  assert.equal(iso(october.accumulation.end), '2026-10-13');
  assert.equal(iso(october.paymentReferenceToday.start), '2026-09-30');
  assert.equal(iso(october.paymentReferenceToday.end), '2026-10-06');
  assert.equal(october.paymentConfirmed, false);
  assert.equal(periods.observedAllowancePeriods(new Date('2026-10-09T12:00:00')).paymentReferenceToday, null);
  activeEvents = [];
  const html = renderToStaticMarkup(React.createElement(PerDiemView, { bundle: { roster: roster(2032, 2) } }));
  assert.match(html, /Semana em acumulação/);
  assert.match(html, /Sem itens previstos/);
  assert.doesNotMatch(html, /R\$ 0,00|· paga|Ciclo do demonstrativo|Sem diárias confirmadas/);
  assert.match(html, /não há pagamento confirmado/);
  assert.match(html, /ainda não homologadas com a empresa/);
  context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : ['2032-02-02T12:00:00'])); } };
  activeEvents = [event('2032-01-31', 'INT'), event('2032-02-01')];
  const pendingHtml = renderToStaticMarkup(React.createElement(PerDiemView, { bundle: { roster: roster(2032, 2) } }));
  assert.match(pendingHtml, /Convertido previsto no mês: R\$ 100,00/);
  assert.match(pendingHtml, /Semana em acumulação: Câmbio pendente/);
  assert.match(pendingHtml, /Câmbio pendente nesta semana: USD/);
  assert.doesNotMatch(pendingHtml, /<details[^>]*\bopen/);
  assert.equal(periods.summarizeForecastRows([{ iso: '2032-02-01', currency: 'BRL', value: Infinity, convertedBRL: Infinity }]).convertedTotalBRL, null);
  assert.equal(periods.summarizeForecastRows([{ iso: '2032-02-01', currency: 'BRL', value: 1e308, convertedBRL: 1e308 }, { iso: '2032-02-01', currency: 'BRL', value: 1e308, convertedBRL: 1e308 }]).convertedTotalBRL, null);
  const rosterSource = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
  const rosterAst = ts.createSourceFile('RosterLaunchView.tsx', rosterSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const summaryStatements = [];
  const rosterMoney = rosterAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'money');
  function findSummary(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ['perDiemSummary', 'perDiemTotal', 'pendingCurrencies'].includes(decl.name.getText(rosterAst)))) summaryStatements.push(node.getText(rosterAst));
    ts.forEachChild(node, findSummary);
  }
  findSummary(rosterAst);
  assert.equal(summaryStatements.length, 3, 'actual roster summary reuses selected-period completeness');
  const rosterCode = ts.transpileModule(rosterMoney.getText(rosterAst) + '\n' + summaryStatements.join('\n')
    + '\nglobalThis.rosterValue = money(perDiemTotal);', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const missingFxRows = [{ iso: '2032-02-01', currency: 'BRL', value: 100, convertedBRL: 100 }, { iso: '2032-02-02', currency: 'USD', value: 20, convertedBRL: null }];
  for (const [rows, parentSummary] of [[missingFxRows, undefined], [[], undefined],
    [missingFxRows.slice(0, 1), periods.summarizeForecastRows(missingFxRows.slice(0, 1), [{ iso: '2032-02-02', airport: 'UNKNOWN' }])]]) {
    const rosterContext = vm.createContext({ summarizeForecastRows: periods.summarizeForecastRows, selectedPerDiemRows: rows,
      scopedFinance: parentSummary ? { perdiem: { monthlySummary: parentSummary } } : undefined });
    vm.runInContext(rosterCode, rosterContext);
    assert.equal(rosterContext.rosterValue, 'Não calculável', 'roster must not render partial or invented zero total');
  }
  let actualGroupTotal;
  function findGroupTotal(node) {
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(rosterAst) === 'groupPerDiemTotal')) actualGroupTotal=node.getText(rosterAst);
    ts.forEachChild(node,findGroupTotal);
  }
  findGroupTotal(rosterAst); assert.ok(actualGroupTotal);
  const groupCode=ts.transpileModule(actualGroupTotal+'\nglobalThis.value=groupPerDiemTotal;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for (const [groupPerDiems,complete,expected] of [[missingFxRows,true,null],[missingFxRows.slice(0,1),false,null],[missingFxRows.slice(0,1),true,100]]) {
    const c=vm.createContext({...periods,groupPerDiems,scopedFinance:{perdiem:{nativeSummary:{complete}}}});vm.runInContext(groupCode,c);assert.equal(c.value,expected,'day grouping must not show a partial total');
  }
  console.log('PASS production financial callers: per-item dates, expiry/night, cross-month currency completeness, no-data UI and separate observed periods — TZ=' + (process.env.TZ || 'device'));
} finally { modules.cleanup(); }
