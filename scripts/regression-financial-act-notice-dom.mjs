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
  return (await build({ stdin: { contents: `import React from 'react';import {act} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';import Control from './client/src/components/finance/FinancialActApplicability';window.act=act;let root;window.mount=pending=>{root?.unmount();const host=document.getElementById('root');root=createRoot(host);root.render(<Control pending={pending}/>);};`, resolveDir: process.cwd(), loader: 'tsx' },
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
    assert.doesNotMatch(panel().querySelector('[aria-label="Pendências deste período"]').textContent, /APZ|ledger|todas as pendências/i, 'no promise beyond the ACT reference');
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
  } finally { w.close(); }
}

await suite(await bundle());
const MUTANTS = {
  'previous rule: notice only without declaration events': [['const needsAction = pendingDates.length > 0;', 'const needsAction = snapshot.history.events.length === 0;']],
  'details open by default': [['const [open, setOpen] = useState(false);', 'const [open, setOpen] = useState(true);']],
  'notice ignores the period': [['const needsAction = pendingDates.length > 0;', 'const needsAction = true;']],
  'cause not listed': [['{pendingCauses.map(cause => <p key={cause} data-act-cause={cause}>{CAUSE_TEXT[cause]}</p>)}', '']],
};
let killed = 0;
for (const [name, overrides] of Object.entries(MUTANTS)) {
  let failure = null;
  try { await suite(await bundle(overrides)); } catch (error) { failure = error; }
  assert.ok(failure instanceof assert.AssertionError && !/mutant anchor present/.test(failure.message), `mutant "${name}" must be killed by an assertion (${failure?.message || 'survived'})`);
  killed++;
}
console.log(`PASS ACT notice rule (real component + journal, DOM): notice follows the period's pending items, not the journal being empty; declaration for another month keeps it; covered/confirmed period shows only the discreet control; details collapsed until "Revisar dados" with dates and cause; unreadable storage -> short error, data preserved; ${killed} mutants killed.`);
