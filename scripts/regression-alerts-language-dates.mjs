// Alerts show proven days compactly ("do dia 30/11 ao dia 01/12") in the selected language, and the
// static translator never leaves a label in the previous language. Synthetic data only, offline.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require(process.env.CREWCHECK_QA_JSDOM_PACKAGE ? path.dirname(process.env.CREWCHECK_QA_JSDOM_PACKAGE) : 'jsdom');

// 1. Pure grouping and formatting.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alerts-language-'));
await build({ entryPoints: ['client/src/lib/alertDateRanges.ts'], bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'ranges.mjs'), logLevel: 'silent' });
const R = await import(path.join(dir, 'ranges.mjs'));
const fmt = (dates, language = 'pt') => R.formatCivilDateRanges(R.groupCivilDates(dates), language);
for (const bad of ['', null, undefined, 'invalid', '31/02/2032', '00/01/2032', '2032-13-01', '1/2/2032', '30/11/32']) assert.equal(R.parseCivilDate(bad), null, String(bad));
assert.equal(R.parseCivilDate('2032-12-01').iso, '2032-12-01');
assert.equal(fmt(['03/11/2032', '04/11/2032', '05/11/2032']), 'do dia 03/11 ao dia 05/11', 'contiguous');
assert.equal(fmt(['05/11/2032']), 'dia 05/11', 'single day');
assert.equal(fmt(['05/11/2032', '03/11/2032', '05/11/2032', 'invalid']), 'dia 03/11; dia 05/11', 'gap never filled, duplicates and invalid dropped');
assert.equal(fmt(['30/11/2032', '01/12/2032', '04/12/2032']), 'do dia 30/11 ao dia 01/12; dia 04/12', 'month boundary is contiguous; disjoint group separate');
assert.equal(fmt(['31/12/2032', '01/01/2033']), 'do dia 31/12/2032 ao dia 01/01/2033', 'year boundary shows the year');
assert.equal(fmt(['30/12/2032', '02/01/2033']), 'dia 30/12/2032; dia 02/01/2033', 'year shown on every group when the set spans years');
assert.equal(fmt(['28/02/2032', '01/03/2032']), 'dia 28/02; dia 01/03', 'leap year: 29/02 missing splits');
assert.equal(fmt(['28/02/2033', '01/03/2033']), 'do dia 28/02 ao dia 01/03', 'non-leap year: contiguous');
assert.equal(fmt([]), '');
assert.equal(fmt(['30/11/2032', '01/12/2032'], 'en'), 'Nov 30 to Dec 1');
assert.equal(fmt(['30/11/2032', '01/12/2032'], 'es'), 'del 30 nov al 1 dic');
assert.equal(fmt(['30/11/2032', '01/12/2032'], 'fr'), 'du 30 nov. au 1 déc.');
assert.equal(fmt(['30/11/2032', '01/12/2032'], 'it'), 'dal 30 nov al 1 dic');
assert.equal(fmt(['30/11/2032', '01/12/2032'], 'de'), '30. Nov. bis 1. Dez.');
// Civil days, not instants: the process time zone never shifts a date.
for (const zone of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland', 'Pacific/Honolulu']) {
  const out = (await import('node:child_process')).execFileSync(process.execPath, ['--input-type=module', '-e', `import * as R from ${JSON.stringify(path.join(dir, 'ranges.mjs'))};console.log(R.formatCivilDateRanges(R.groupCivilDates(['31/12/2032','01/01/2033']),'en'))`], { env: { ...process.env, TZ: zone }, encoding: 'utf8' }).trim();
  assert.equal(out, 'Dec 31, 2032 to Jan 1, 2033', `TZ ${zone}`);
}

// 2. Real AlertCenter and translator in a DOM.
await build({ entryPoints: ['scripts/fixtures/alerts-language-app.tsx'], bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(dir, 'app.js'), logLevel: 'silent', loader: { '.css': 'empty' } });
const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
function open(storage = {}, device = 'pt-BR') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.invalid/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  Object.defineProperty(w.navigator, 'language', { value: device, configurable: true });
  Object.defineProperty(w.navigator, 'languages', { value: [device], configurable: true });
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.fetch = () => { throw Error('No network in this test'); };
  w.eval(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'));
  return w;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 80));
const text = el => el?.textContent.replace(/\s+/g, ' ').trim();
const nav = w => [...w.document.querySelectorAll('nav span')].map(text);
const dates = w => [...w.document.querySelectorAll('.cc-alert-dates')].map(el => [el.dataset.alertDates, text(el)]);
// Visible text outside elements explicitly marked as the Portuguese original analysis.
const ownText = w => { const out = []; const walk = node => { if (node.nodeType === 3) { const v = node.nodeValue.trim(); if (v) out.push(v); return; } if (node.nodeType !== 1 || node.getAttribute('lang') === 'pt-BR' || ['SCRIPT', 'STYLE'].includes(node.tagName)) return; node.childNodes.forEach(walk); }; walk(w.document.body); return out.join(' | '); };

// Portuguese (device pt-BR, nothing saved).
let w = open(); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu']);
// Pending analysis is listed first (its own section), then the alert cards.
assert.deepEqual(dates(w), [
  ['possible', 'Datas possíveis (dados pendentes): dia 02/12; dia 31/12'],
  ['review', 'Dias a revisar: do dia 30/11 ao dia 01/12; dia 04/12'],
  ['date', 'Data: 05/12/2032'],
  ['unproven', 'Datas não comprovadas na escala.'],
]);
// The count in the description (3) never produces dates: only the evidence (30/11, 01/12, 04/12) does.
assert.doesNotMatch(dates(w)[1][1], /02\/12|03\/12/);
// The undated insufficient-history notice gets no date line and is never presented as a confirmed day.
const historyNotice = [...w.document.querySelectorAll('details')].find(d => text(d.querySelector('summary')) === 'Histórico insuficiente para concluir a janela de 28 dias');
assert(historyNotice && !historyNotice.querySelector('.cc-alert-dates'));
assert.equal(w.document.querySelectorAll('[data-alert-dates="review"]').length, 1, 'only the confirmed sequence is "to review"');
assert.equal(w.document.querySelector('[data-alert-dates="review"] time').getAttribute('datetime'), '2032-11-30');
const evidence = w.document.querySelector('.cc-alert-card section[aria-label]');
assert.equal(text(evidence.querySelector('h3')), 'Datas e evidências da contagem');
assert.deepEqual([...evidence.querySelectorAll('button')].map(text), ['Abrir 30/11/2032 na escala', 'Abrir 01/12/2032 na escala', 'Abrir 01/12/2032 na escala', 'Abrir 04/12/2032 na escala']);
assert.doesNotMatch(ownText(w), /\b(Days to review|Review|Details|Alerts|Roster|Depart|Open)\b/, 'no English in the Portuguese screen');
assert.equal(w.__alertsBefore, JSON.stringify([w.__alerts, w.__pending]), 'alerts are not mutated');

// English selected: the whole screen in English; the original analysis stays marked pt-BR.
w.__setLanguage('en'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Roster', 'Depart', 'Alerts', 'Menu']);
assert.deepEqual(dates(w).map(([, value]) => value), ['Possible dates (pending data): Dec 2; Dec 31', 'Days to review: Nov 30 to Dec 1; Dec 4', 'Date: Dec 5, 2032', 'Dates not proven in the roster.']);
assert.equal(text(w.document.querySelector('h1')), 'Alerts');
assert.doesNotMatch(ownText(w), /\b(Dias|Revisar|Detalhes|Alertas|Escala|Saída|Abrir|Datas|Madrugada)\b/, 'no Portuguese outside the marked original analysis');
assert([...w.document.querySelectorAll('[lang="pt-BR"]')].length > 0, 'original analysis kept and marked');
// Back to Portuguese in the same session: nothing stays in English (the reported mixed screen).
w.__setLanguage('pt'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu']);
assert.equal(text(w.document.querySelector('h1')), 'Alertas');
assert.doesNotMatch(ownText(w), /\b(Days to review|Review|Details|Alerts|Roster|Depart)\b/);
// Account settings store pt-BR/en-US and announce crewcheck:locale-change: both directions apply.
w.__setLocaleSetting('en-US'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Roster', 'Depart', 'Alerts', 'Menu']);
w.__setLocaleSetting('pt-BR'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu']);
// A label changed by the app after translation becomes the new source, never the stale one.
w.__setLanguage('en'); await settle();
const span = w.document.querySelectorAll('nav span')[1]; span.firstChild.nodeValue = 'Alertas'; await settle();
assert.equal(text(span), 'Alerts');
w.__setLanguage('pt'); await settle();
assert.equal(text(span), 'Alertas', 'restores the latest source, not an older one');
assert.equal(w.localStorage.getItem('crewcheck_language'), 'pt', 'selection saved');

// Saved choice wins over the device; device language is the fallback; unsupported falls back to pt.
w = open({ crewcheck_language: 'es' }, 'en-US'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Escala', 'Salida', 'Alertas', 'Menu']);
assert.match(dates(w)[1][1], /^Días a revisar: del 30 nov al 1 dic; día 4 dic$/);
w = open({}, 'en-US'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Roster', 'Depart', 'Alerts', 'Menu'], 'device language without a saved choice');
w = open({ crewcheck_language: 'xx' }, 'ja-JP'); await settle();
assert.deepEqual(nav(w), ['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu'], 'unsupported saved and device language fall back to Portuguese');
for (const [language, label] of [['fr', 'Jours à examiner'], ['it', 'Giorni da verificare'], ['de', 'Zu prüfende Tage']]) {
  w = open({ crewcheck_language: language }); await settle();
  assert(dates(w)[1][1].startsWith(label + ':'), language);
}
assert.deepEqual(errors, []);
console.log('PASS alerts language and dates: contiguous/disjoint/duplicate/invalid/month/year/leap grouping without filling gaps, civil dates independent of TZ, review vs possible vs unproven vs undated kept apart, count never becomes dates, 6 languages, saved choice > device > pt, language switch both ways (menu and account settings) with no label left in the previous language, alerts unmutated');
