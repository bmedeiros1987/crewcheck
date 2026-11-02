// DOM proof of the ACT notice rule (real component, real journal; not layout certification — the
// compiled-app screenshots live in regression-financial-act-notice-app.mjs):
//  - the short notice depends on the displayed period's items that wait on the declaration (prop),
//    not on whether any declaration event exists: a declaration for another month still shows it,
//    and no pending item (e.g. covered by an account value) never shows it, even with no declaration;
//  - details stay collapsed until "Revisar dados"; the period's dates and cause are listed;
//  - storage that cannot be read gives a short error status.
// Mutants restoring the previous rule (notice only when the journal has no event) must fail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(process.env.CREWCHECK_QA_JSDOM_PACKAGE || import.meta.url)('jsdom');

const component = path.resolve('client/src/components/finance/FinancialActApplicability.tsx');
async function bundle(overrides = []) {
  return (await build({ stdin: { contents: `import React from 'react';import {act} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Control,{AllowanceMinimumReference} from './client/src/components/finance/FinancialActApplicability';window.act=act;let root;window.mount=pending=>{root?.unmount();const host=document.getElementById('root');root=createRoot(host);root.render(<Control pending={pending}/>);};window.mountMinimum=()=>{root?.unmount();const host=document.getElementById('root');root=createRoot(host);root.render(<AllowanceMinimumReference rows={[{iso:'2026-10-20',label:'Almoço',currency:'USD',value:28.7,source:'Fonte sintética do piso publicado'},{iso:'2026-10-20',label:'Jantar',currency:'USD',value:31.7,source:'Fonte sintética do piso publicado'}]} totals={{USD:60.4}} inspections={[{iso:'2026-10-21',currency:'GBP',publishedFloorMinor:2400,reason:'Escopo sintético pendente'}]}/>);};`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, outfile: '/tmp/financial-act-notice-dom.js', format: 'iife', jsx: 'automatic', tsconfig: 'tsconfig.json',
    plugins: [{ name: 'mutant', setup(b) { b.onLoad({ filter: /FinancialActApplicability\.tsx$/ }, args => {
      let contents = fs.readFileSync(args.path, 'utf8');
      for (const [from, to] of overrides) { assert(contents.includes(from), `mutant anchor present: ${from.slice(0, 60)}`); contents = contents.replace(from, to); }
      return { loader: 'tsx', contents, resolveDir: path.dirname(component) };
    }); } }] })).outputFiles.find(file => file.path.endsWith('.js')).text;
}

async function suite(code) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://synthetic.invalid', runScripts: 'outside-only' }), w = dom.window;
  w.IS_REACT_ACT_ENVIRONMENT = true;
  w.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.({}), 0) }; } };
  const owner = 'synthetic-notice-dom', key = 'crewcheck_financial_act_applicability_v1:' + owner;
  w.localStorage.setItem('crewcheck_language', 'pt');
  w.localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner, role: 'user' })); w.localStorage.setItem('crewcheck_auth_token', 'synthetic-token');
  Object.defineProperty(w.navigator, 'locks', { value: { request: async (k, fn) => fn() } });
  const event = (revision, from, through = '2027-11-30') => ({ revision, from, through, confirmed: true, source: 'owner_financial_confirmation', active: true, employer: 'TAM_LINHAS_AEREAS_SA', role: 'cabin', coverage: 'clause_1_2_included' });
  const journal = events => JSON.stringify({ schema: 1, ownerId: owner, revision: events.length, events });
  const pending = [{ iso: '2026-10-20', actCause: 'act_missing' }, { iso: '2026-10-21', actCause: 'act_missing' }];
  try {
    w.eval(code);
    const panel = () => w.document.querySelector('[data-financial-act-context]');
    const notice = () => /Confirme seus dados para calcular as diárias\./.test(panel()?.textContent || '');
    const mount = async items => { await w.act(async () => w.mount(items)); };

    // No declaration, nothing in the period waits on it (e.g. an account value covers it): no notice.
    await mount([]);
    assert.equal(notice(), false, 'no pending item: no notice even without any declaration');
    assert.equal(panel().className, 'cc-act-discreet', 'discreet control');
    assert.equal(panel().querySelector(':scope > details').open, false, 'discreet control collapsed');
    // No declaration and pending items: notice, collapsed details, review opens them with dates and cause.
    await mount(pending);
    assert.equal(notice(), true, 'pending items: short notice');
    const details = panel().querySelector(':scope > details');
    assert.equal(details.open, false, 'details collapsed by default');
    const review = [...panel().querySelectorAll('button')].find(button => button.textContent === 'Revisar dados');
    assert.ok(review, 'review button');
    await w.act(async () => review.click());
    assert.equal(panel().querySelector(':scope > details').open, true, 'review opens the details');
    assert.match(panel().textContent, /Datas pendentes neste período: 20\/10, 21\/10/);
    assert.deepEqual([...panel().querySelectorAll('[data-act-cause]')].map(node => node.dataset.actCause), ['act_missing']);
    assert.doesNotMatch((panel().querySelector('[data-act-pending-section], [aria-label="Pendências deste período"]')?.textContent ?? ''), /APZ|ledger|todas as pendências/i, 'no promise beyond the ACT reference');
    // A declaration for another month exists (journal not empty) but this period still waits: notice stays.
    w.localStorage.setItem(key, journal([event(1, '2026-11-01')]));
    await mount([{ iso: '2026-10-20', actCause: 'act_missing' }]);
    assert.equal(notice(), true, 'declaration for another month does not hide this period');
    // Valid declaration covering the period: nothing pending -> discreet only.
    w.localStorage.setItem(key, journal([event(1, '2026-01-01')]));
    await mount([]);
    assert.equal(notice(), false, 'confirmed period: no notice');
    assert.equal(panel().className, 'cc-act-discreet');
    // Unreadable declaration: short error status, data preserved.
    w.localStorage.setItem(key, '{corrupt');
    await mount(pending);
    assert.equal(panel().dataset.financialActContext, 'unavailable');
    assert.match(panel().textContent, /Não foi possível ler seus dados de diárias neste aparelho\./);
    assert.equal(w.localStorage.getItem(key), '{corrupt', 'invalid data preserved');

    // English: every visible text of the panel, the <select> options and the expanded help included,
    // is English; official names stay as published. A live language switch re-renders without remnants.
    const OFFICIAL = /TAM Linhas Aéreas S\/A|LATAM Brasil|ABSA\/LATAM Cargo|\((Comissários|Pilotos|Lei 7\.064\/1982)\)/g;
    const PORTUGUESE = /\b(Confirme|Confirmar|Revisar|Datas|Declaração|declaração|Empresa|Não|Detalhes|Ação|Empregador|Perfil|Selecione|Declarar|Revogar|Comissários|Pilotos|Aplicar|Fim|Preparar|Histórico|período|aparelho|vínculo|Sem|abrange|titular)\b/;
    const ENGLISH_UI = /\b(Confirm|Review|Employer|Select|Declaration|Pending|Apply|Revoke|Prepare|Details)\b/;
    const fullText = () => { const panel = panel_(); return [...panel.querySelectorAll('*')].filter(node => !node.children.length || node.tagName === 'OPTION').map(node => node.textContent).join(' | ') + ' | ' + panel.textContent; };
    const panel_ = () => w.document.querySelector('[data-financial-act-context]');
    w.localStorage.setItem(key, journal([event(1, '2026-01-01')]));
    w.localStorage.setItem('crewcheck_language', 'en');
    await mount(pending);
    assert.match(panel_().textContent, /Confirm your details to calculate allowances\./, 'EN notice');
    const enReview = [...panel_().querySelectorAll('button')].find(button => button.textContent === 'Review details');
    assert.ok(enReview, 'EN review button'); await w.act(async () => enReview.click());
    const options = [...panel_().querySelectorAll('option')].map(option => option.textContent);
    assert.deepEqual(options, ['Declare application for the period', 'Revoke from a date', 'Select explicitly', 'TAM Linhas Aéreas S/A — LATAM Brasil', 'Select explicitly', 'Cabin crew (Comissários)', 'Pilots (Pilotos)'], 'EN options, official names kept');
    assert.doesNotMatch(fullText().replace(OFFICIAL, ''), PORTUGUESE, 'EN: no Portuguese interface text, expanded form included');
    assert.match(panel_().textContent, /clause 1\.2/, 'EN keeps the clause reference');
    assert.equal(panel_().getAttribute('lang'), 'en');
    // Live switch back to Portuguese: no English left.
    await w.act(async () => { w.localStorage.setItem('crewcheck_language', 'pt'); w.dispatchEvent(new w.CustomEvent('crewcheck:language-change', { detail: { language: 'pt' } })); });
    assert.match(panel_().textContent, /Confirme seus dados para calcular as diárias\./, 'live switch to PT');
    assert.doesNotMatch(fullText(), ENGLISH_UI, 'PT: no English interface text after the switch');
    assert.equal(panel_().getAttribute('lang'), 'pt-BR');
    // English beyond the initial form: the pending dates, preview, save and validation messages and
    // history follow the language (dates formatted per language, same days); a live switch after
    // saving re-renders the saved message and history in Portuguese.
    w.localStorage.setItem('crewcheck_language', 'en'); w.localStorage.removeItem(key);
    await mount([{ iso: '2026-10-20', actCause: 'act_missing' }]);
    const click = async text => { const button = [...panel_().querySelectorAll('button')].find(node => node.textContent === text); assert.ok(button, `button ${text}`); await w.act(async () => button.click()); };
    await click('Review details');
    assert.match(panel_().textContent, /Pending dates in this period: 20 Oct/, 'EN pending date format');
    await click('Prepare declaration without saving');
    assert.match(panel_().textContent, /Select employer and profile, confirm the coverage and check the ACT validity dates\./, 'EN validation message');
    const selects = () => panel_().querySelectorAll('select');
    const choose = async (index, value) => { await w.act(async () => { const el = selects()[index]; el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); }); };
    await choose(1, 'TAM_LINHAS_AEREAS_SA'); await choose(2, 'cabin');
    await w.act(async () => panel_().querySelector('input[type=checkbox]').click());
    await click('Prepare declaration without saving');
    const preview = panel_().querySelector('[data-act-preview]');
    assert.ok(preview, 'EN preview');
    assert.match(preview.textContent, /1 Jan 2026 to 30 Nov 2027: TAM — Cabin crew \(Comissários\) — account holder’s declaration/, 'EN preview with formatted dates and role');
    assert.doesNotMatch(preview.textContent.replace(OFFICIAL, ''), PORTUGUESE, 'EN preview fully English');
    await click('Confirm and save the declaration in this account');
    assert.match(panel_().textContent, /Financial declaration saved in this account and device\./, 'EN save message');
    assert.equal(JSON.parse(w.localStorage.getItem(key)).events[0].role, 'cabin', 'saved declaration unchanged by language');
    await mount([]);
    const history = [...panel_().querySelectorAll('details details')].find(node => /Declaration history/.test(node.textContent));
    assert.ok(history, 'EN history'); await w.act(async () => { history.open = true; });
    assert.match(history.textContent, /1 Jan 2026 to 30 Nov 2027: ACT Cabin crew \(Comissários\)/, 'EN history dates and role');
    await w.act(async () => { w.localStorage.setItem('crewcheck_language', 'pt'); w.dispatchEvent(new w.CustomEvent('crewcheck:language-change', { detail: { language: 'pt' } })); });
    assert.match(panel_().textContent, /01\/01\/2026 a 30\/11\/2027: ACT Comissários/, 'PT history after the switch');
    assert.doesNotMatch(fullText(), ENGLISH_UI, 'PT after the switch: no English left');

    // ACT minimum reference: labels, dates and currency follow the language; amounts unchanged.
    w.localStorage.setItem('crewcheck_language', 'en');
    await w.act(async () => w.mountMinimum());
    const minimum = () => w.document.querySelector('[data-allowance-minimum-reference]');
    for (const node of minimum().querySelectorAll('details')) await w.act(async () => { node.open = true; });
    const enMinimum = minimum().textContent;
    assert.match(enMinimum, /20 Oct 2026 · Lunch · US\$28\.70/, 'EN minimum row: date, label, currency format');
    assert.match(enMinimum, /20 Oct 2026 · Dinner · US\$31\.70/);
    assert.match(enMinimum, /Minimum reference subtotal: US\$60\.40/);
    assert.match(enMinimum, /21 Oct 2026 · printed floor for the full meal £24\.00/);
    const enOwn = [...minimum().querySelectorAll('*')].filter(node => !node.children.length && !node.closest('[lang="pt-BR"]')).map(node => node.textContent).join(' | ');
    assert.doesNotMatch(enOwn, PORTUGUESE, 'EN minimum reference: interface fully English (engine sources marked pt-BR)');
    assert.doesNotMatch(enOwn, /Almoço|Jantar|Ceia|piso|Subtotal da/, 'EN minimum reference: no Portuguese label');
    await w.act(async () => { w.localStorage.setItem('crewcheck_language', 'pt'); w.dispatchEvent(new w.CustomEvent('crewcheck:language-change', { detail: { language: 'pt' } })); });
    const ptMinimum = minimum().textContent;
    assert.match(ptMinimum, /20\/10\/2026 · Almoço · US\$\s?28,70/, 'PT minimum row after the switch');
    assert.match(ptMinimum, /Subtotal da referência mínima: US\$\s?60,40/);
    assert.doesNotMatch(ptMinimum, /Lunch|Dinner|Minimum reference|printed floor/, 'PT minimum reference: no English left');

    // Error state in English.
    w.localStorage.setItem('crewcheck_language', 'en'); w.localStorage.setItem(key, '{corrupt');
    await mount(pending);
    assert.match(panel_().textContent, /Could not read your allowance details on this device\./);
    assert.doesNotMatch(fullText(), PORTUGUESE, 'EN error state fully English');
  } finally { w.close(); }
}

await suite(await bundle());
const MUTANTS = {
  'EN meal label left in Portuguese': [["const label = (value: string) => lang === 'pt-BR' ? value : ALLOWANCE_LABELS_EN[value] || value;", "const label = (value: string) => value;"]],
  'currency fixed to pt-BR': [["value.toLocaleString(lang === 'pt-BR' ? 'pt-BR' : 'en-GB', { style: 'currency', currency })", "value.toLocaleString('pt-BR', { style: 'currency', currency })"]],
  'preview dates left in ISO': [["{longDay(interval.from)} {t.to} {longDay(interval.through)}:", "{interval.from} {t.to} {interval.through}:"]],
  'previous rule: notice only without declaration events': [['const needsAction = pendingDates.length > 0;', 'const needsAction = snapshot.history.events.length === 0;']],
  'details open by default': [['const [open, setOpen] = useState(false);', 'const [open, setOpen] = useState(true);']],
  'notice ignores the period': [['const needsAction = pendingDates.length > 0;', 'const needsAction = true;']],
  'EN option left in Portuguese': [["<option value=\"apply\">{t.apply}</option>", "<option value=\"apply\">Declarar aplicação no período</option>"]],
  'EN legal help left in Portuguese': [["      <p>{t.intro}</p>", "      <p>{COPY.pt.intro}</p>"]],
  'cause not listed': [['{pendingCauses.map(cause => <p key={cause} data-act-cause={cause}>{t.causes[cause]}</p>)}', '']],
};
let killed = 0;
for (const [name, overrides] of Object.entries(MUTANTS)) {
  let failure = null;
  try { await suite(await bundle(overrides)); } catch (error) { failure = error; }
  assert.ok(failure instanceof assert.AssertionError && !/mutant anchor present/.test(failure.message), `mutant "${name}" must be killed by an assertion (${failure?.message || 'survived'})`);
  killed++;
}
console.log(`PASS ACT notice rule (real component + journal, DOM): notice follows the period's pending items, not the journal being empty; declaration for another month keeps it; covered/confirmed period shows only the discreet control; details collapsed until "Revisar dados" with dates and cause; unreadable storage -> short error, data preserved; English panel complete (options, help, error) with official names kept and live PT/EN switch without remnants; ${killed} mutants killed.`);
