// Interface copy of the pending standby/reserve window items (STANDBY/RESERVE_WINDOW_UNRESOLVED):
// every non-Portuguese interface language gets its own title, description with the roster's civil
// date and details carrying the same meaning (a reading to check: not an irregularity, not 0 h, no
// inferred start, no assumed call-out); Portuguese keeps the engine's own text (null); other codes keep
// the existing fallback (null). Real module, synthetic alerts. Mutants must fail by assertion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unresolved-copy-'));
const source = path.resolve('client/src/lib/alertExperienceText.ts');
let counter = 0;
async function load(overrides = []) {
  const out = path.join(dir, `copy-${counter++}.mjs`);
  await build({ stdin: { contents: "export { pendingAlertCopy } from './client/src/lib/alertExperienceText'; export { parseCivilDate, formatCivilDate } from './client/src/lib/alertDateRanges';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
    plugins: [{ name: 'mutant', setup(b) { b.onLoad({ filter: /alertExperienceText\.ts$/ }, args => {
      let contents = fs.readFileSync(args.path, 'utf8');
      for (const [from, to] of overrides) { assert(contents.includes(from), `mutant anchor present: ${from.slice(0, 60)}`); contents = contents.replace(from, to); }
      return { loader: 'ts', contents };
    }); } }] });
  return import(pathToFileURL(out).href);
}

// Words that only occur in the Portuguese engine text ("reserva" is also Spanish, so it is not listed).
const PORTUGUESE = /\b(sem|janela|sobreaviso|horários|estação|irregularidade|Pendência|acionamento|comprovada)\b/i;
const MEANING = {
  en: [/not a confirmed irregularity/, /nor 0 h/, /does not infer the start/, /does not assume a call-out/],
  es: [/no es una irregularidad confirmada/, /ni 0 h/, /no infiere el inicio/, /no presume activación/],
  fr: [/ni irrégularité confirmée/, /ni 0 h/, /ne déduit pas le début/, /ne présume pas d’activation/],
  it: [/non un’irregolarità confermata/, /né 0 h/, /non deduce l’inizio/, /non presume attivazione/],
  de: [/keine bestätigte Unregelmäßigkeit/, /nicht 0 h/, /leitet den Beginn nicht ab/, /unterstellt keine Aktivierung/],
};
async function suite(M) {
  const format = language => value => { const date = M.parseCivilDate(value); return date ? M.formatCivilDate(date, language, true) : value || ''; };
  const standby = { code: 'STANDBY_WINDOW_UNRESOLVED', date: '17/08/2026' }, reserve = { code: 'RESERVE_WINDOW_UNRESOLVED', date: '20/08/2026' };
  assert.equal(M.pendingAlertCopy(standby, 'pt', format('pt')), null, 'Portuguese keeps the engine text');
  assert.equal(M.pendingAlertCopy({ code: 'ROLLING_28D_DATA_GAP', date: '17/08/2026' }, 'en', format('en')), null, 'other codes keep the fallback');
  for (const language of Object.keys(MEANING)) {
    const s = M.pendingAlertCopy(standby, language, format(language)), r = M.pendingAlertCopy(reserve, language, format(language));
    assert.ok(s && r, `${language}: copy for both codes`);
    assert.notEqual(s.title, r.title, `${language}: standby and reserve titled apart`);
    assert.ok(s.description.startsWith(format(language)('17/08/2026')) && r.description.startsWith(format(language)('20/08/2026')), `${language}: description starts with the roster date`);
    assert.notEqual(s.description, r.description, `${language}: description names standby vs reserve`);
    for (const pattern of MEANING[language]) assert.match(s.details, pattern, `${language}: same meaning (${pattern})`);
    for (const text of [s.title, s.description, s.details, r.title, r.description]) assert.doesNotMatch(text, PORTUGUESE, `${language}: no Portuguese (${text})`);
  }
  assert.match(M.pendingAlertCopy(standby, 'en', format('en')).description, /^Aug 17, 2026: times without stations do not allow assigning the start and end of the standby\.$/);
  assert.equal(M.pendingAlertCopy(reserve, 'en', format('en')).title, 'Reserve without a proven window');
}

await suite(await load());
const MUTANTS = {
  'English description left in Portuguese': [["describe: (date, what) => `${date}: times without stations do not allow assigning the start and end of ${what}.`", "describe: (date, what) => `${date}: os horários sem estação não permitem atribuir início e fim.`"]],
  'meaning lost (0 h dropped)': [["detail: 'Reading pending, not a confirmed irregularity nor 0 h.", "detail: 'Reading pending."]],
  'reserve shown as standby': [["const kind = alert.code === 'STANDBY_WINDOW_UNRESOLVED' ? 'standby' : alert.code === 'RESERVE_WINDOW_UNRESOLVED' ? 'reserve' : null;", "const kind = alert.code?.endsWith('_WINDOW_UNRESOLVED') ? 'standby' : null;"]],
  'Portuguese overridden': [["if (language === 'pt' || !alert) return null;", "if (!alert) return null; if (language === 'pt') return { title: 'Sobreaviso', description: 'Sobreaviso', details: 'Sobreaviso' };"]],
};
let killed = 0;
for (const [name, overrides] of Object.entries(MUTANTS)) {
  let failure = null;
  try { await suite(await load(overrides)); } catch (error) { failure = error; }
  assert.ok(failure instanceof assert.AssertionError && !/mutant anchor present/.test(failure.message), `mutant "${name}" must be killed by an assertion (${failure?.message || 'survived'})`);
  killed++;
}
fs.rmSync(dir, { recursive: true, force: true });
console.log(`PASS unresolved window alert copy: EN/ES/FR/IT/DE title, description with the roster date and details with the same meaning (not an irregularity, not 0 h, no inference, no assumed call-out), no Portuguese left; Portuguese keeps the engine text; other codes keep the fallback; ${killed} mutants killed.`);
