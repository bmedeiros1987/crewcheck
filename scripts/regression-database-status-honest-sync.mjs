// Database status copy must not promise a sync that does not exist. Runs on PREPARED sources
// (node scripts/v139/apply.mjs), so it checks the final caller, not the raw files.
//  - premise: after full prepare nothing calls the offline roster queue (syncPendingRosters /
//    saveRosterOfflineFirst), so there is no automatic resend; if someone wires an outbox, this
//    test fails and the copy has to be revisited consciously;
//  - getDatabaseStatus, real module with a synthetic auth/fetch double, in every state: remote
//    success, local fallback (signed out, database down or up), real error (status 5xx, 401) and a
//    server message that must reach the user unchanged (a real error is never hidden);
//  - no state promises a later or automatic sync; the old copy is caught by the same predicate
//    (counterproof), and a mutant restoring it fails by assertion;
//  - the Settings card (prepared Home) uses the same message and labels "Sincronização pendente",
//    and every Portuguese string of the card has an English translation the static translator can
//    apply (<= 90 characters).
// Synthetic only: no network, no account, no storage of real data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(home, /account-active-reconciliation-fenced-v1/, 'run after node scripts/v139/apply.mjs (prepared sources)');

// Premise: no live resend of offline rosters in the prepared client.
const sources = fs.readdirSync('client/src', { recursive: true }).filter(file => /\.(ts|tsx)$/.test(file));
const callSites = name => sources.filter(file => file !== path.join('lib', 'offlineSync.ts'))
  .flatMap(file => fs.readFileSync(path.join('client/src', file), 'utf8').split('\n').filter(line => line.includes(`${name}(`) && !line.includes(`function ${name}(`)).map(line => `${file}: ${line.trim().slice(0, 120)}`));
assert.deepEqual(callSites('syncPendingRosters'), [], 'no automatic resend: syncPendingRosters has no caller after prepare');
assert.deepEqual(callSites('saveRosterOfflineFirst'), [], 'no offline-first save path feeds the queue after prepare');

// Promise of a later/automatic sync, in Portuguese or English.
const PROMISE = /(ser[áa]o?|será) sincronizad|sincroniza(ção|r) (ser[áa] )?retomad|quando (a conexão|o banco) voltar|sincronizará|fila de sincroniza|tentad[ao] novamente|will (be )?sync|automatic(ally)? (re)?(send|sync)|sync queue/i;
const OLD_COPY = [
  'Modo local protegido ativo. A sincronização será retomada quando o banco voltar.',
  'Banco temporariamente indisponível. O histórico local permanece ativo e será sincronizado depois.',
  'Seus dados permanecem neste dispositivo e serão sincronizados quando a conexão voltar.',
  'Fila de sincronização',
];
for (const text of OLD_COPY) assert.match(text, PROMISE, `counterproof: the old copy is caught by the honesty predicate (${text})`);
for (const text of OLD_COPY) assert.equal(sources.filter(file => fs.readFileSync(path.join('client/src', file), 'utf8').includes(text)).length, 0, `old copy absent from prepared sources: ${text}`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'database-status-'));
async function load(source) {
  // The module under test is written next to the real one (same relative imports), bundled, removed.
  const file = path.resolve('client/src/lib', `.qa-database-client-${process.pid}-${Math.random().toString(16).slice(2)}.ts`);
  fs.writeFileSync(file, source);
  const out = path.join(dir, path.basename(file).replace(/\.ts$/, '.mjs'));
  try {
    await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent',
      alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
      plugins: [{ name: 'fixture', setup(b) {
        // Synthetic auth double: the token and the authenticated call are controlled by the test.
        b.onResolve({ filter: /^\.\/authClient$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
        b.onResolve({ filter: /^current-auth-session$/ }, () => ({ path: path.resolve('client/src/lib/authClient.ts'), namespace: 'file' }));
        // Keep the real session-capture binding required by current roster readers.
        // This suite exercises status only; separate real-reader regressions exercise its fences.
        b.onLoad({ filter: /^auth$/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export {captureAuthSession} from "current-auth-session";export const getToken=()=>globalThis.__qa.token;export const getStoredUser=()=>null;export async function authFetch(url){return globalThis.__qa.authFetch(url);}' }));
      } }] });
  } finally { fs.rmSync(file, { force: true }); }
  return import(pathToFileURL(out).href);
}

async function suite(module) {
  const { getDatabaseStatus, DATABASE_STATUS_MESSAGES } = module;
  const run = async ({ token = null, health, status }) => {
    globalThis.__qa = { token, authFetch: async () => { if (status instanceof Error) throw status; return status; } };
    globalThis.fetch = async () => { if (health instanceof Error) throw health; return { json: async () => health }; };
    return getDatabaseStatus();
  };
  const httpError = (code, status) => Object.assign(new Error('synthetic'), { code, status });

  // Remote success: no local fallback, no fallback copy.
  const ok = await run({ token: 'synthetic', health: { ok: true, connected: true, configured: true }, status: { ok: true, database: 'qa' } });
  assert.deepEqual([ok.connected, ok.localOnly, ok.database], [true, undefined, 'qa'], 'remote success');
  // Local fallback, signed out, database down: honest copy, no promise.
  const signedOutDown = await run({ health: new Error('offline') });
  assert.deepEqual([signedOutDown.localOnly, signedOutDown.connected, signedOutDown.message], [true, false, DATABASE_STATUS_MESSAGES.unavailableSignedOut], 'signed out + database down');
  // Signed out, database up: asks to sign in (an action, not a promise).
  const signedOutUp = await run({ health: { ok: true, connected: true, configured: true } });
  assert.equal(signedOutUp.message, 'Banco principal disponível. Faça login para sincronizar esta conta.');
  // Real error: authenticated status call fails.
  const down = await run({ token: 'synthetic', health: { ok: false, connected: false }, status: httpError('DATABASE_OFFLINE', 503) });
  assert.deepEqual([down.localOnly, down.connected, down.message], [true, false, DATABASE_STATUS_MESSAGES.unavailable], 'database down while signed in');
  // A message from the server is shown as is (a real error is never replaced by a generic text).
  const configured = await run({ token: 'synthetic', health: { ok: false, connected: false, message: 'Banco aguardando configuração.' }, status: httpError('', 500) });
  assert.equal(configured.message, 'Banco aguardando configuração.', 'server message preserved');
  // Expired session: says so and asks to sign in again.
  const expired = await run({ token: 'synthetic', health: { ok: true, connected: true }, status: httpError('AUTH_REQUIRED', 401) });
  assert.equal(expired.message, 'Login expirado. Histórico local ativo; entre novamente para sincronizar.');
  for (const state of [ok, signedOutDown, signedOutUp, down, configured, expired]) assert.doesNotMatch(String(state.message || ''), PROMISE, `no state promises a later or automatic sync: ${state.message}`);
  // The fallback copy says data stays on the device and sync is pending, without claiming a save.
  assert.match(DATABASE_STATUS_MESSAGES.unavailable, /Dados deste dispositivo continuam aqui; sincronização pendente\.$/);
  assert.doesNotMatch(`${DATABASE_STATUS_MESSAGES.unavailable} ${DATABASE_STATUS_MESSAGES.unavailableSignedOut}`, /\bsalv[oa]s?\b/i, 'the status never claims something was saved');
}

const source = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
await suite(await load(source));

// Mutant: the old copy restored must fail by assertion.
const mutantFrom = "  unavailable: 'Banco indisponível. Dados deste dispositivo continuam aqui; sincronização pendente.',";
assert(source.includes(mutantFrom), 'mutant anchor present');
let failure = null;
try { await suite(await load(source.replace(mutantFrom, "  unavailable: 'Banco temporariamente indisponível. O histórico local permanece ativo e será sincronizado depois.',"))); } catch (error) { failure = error; }
assert(failure instanceof assert.AssertionError, `old copy mutant must be killed by an assertion (${failure?.message || 'survived'})`);

// Settings card in the prepared Home: same message, honest label, English for every string.
const card = home.slice(home.indexOf('function DatabaseConnectionCard('), home.indexOf('function AdminFinancialCalibration('));
assert.match(card, /: DATABASE_STATUS_MESSAGES\.unavailable\)/, 'card fallback uses the same honest message');
assert.match(card, /'Sincronização pendente'/);
assert.doesNotMatch(card, PROMISE, 'card copy promises nothing');
// Portuguese source without English words mixed in (the admin migration chips included).
assert.doesNotMatch(card, /aguardando migration|conexão e migration/, 'Portuguese card copy says "migração"');
assert.match(card, /<>\{status\?\.missingOptionalCount \|\| 0\} módulo\(s\) aguardando migração<\/>/, 'the count is its own text node, so the fixed part is translatable');
const i18n = fs.readFileSync('client/src/lib/i18n.ts', 'utf8');
const enTable = i18n.slice(i18n.indexOf('const staticUiTranslations'), i18n.indexOf('  es: {', i18n.indexOf('const staticUiTranslations')));
const literals = [...card.matchAll(/'([^'{}]*[A-Za-zÀ-ú][^'{}]*)'/g)].map(match => match[1]).filter(text => !/^(cz-|cc-|connected|offline)/.test(text) && !text.startsWith(' ') && !/^[a-z-]+$/.test(text));
const required = [...new Set([...literals, 'módulo(s) aguardando migração', 'Banco indisponível. Dados deste dispositivo continuam aqui; sincronização pendente.', 'Banco indisponível e sem login. Dados deste dispositivo ficam só aqui.', 'Banco principal disponível. Faça login para sincronizar esta conta.', 'Login expirado. Histórico local ativo; entre novamente para sincronizar.', 'Banco aguardando configuração.'])];
for (const text of required) {
  const entry = new RegExp(`'${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': '([^']+)'`).exec(enTable);
  assert(entry, `English translation present for: ${text}`);
  assert(text.length <= 90 && entry[1].length <= 90, `fits the static translator (<= 90): ${text}`);
  assert.doesNotMatch(entry[1], PROMISE, `English copy promises nothing: ${entry[1]}`);
}

console.log(`PASS honest database status (prepared caller): no live resend of offline rosters; remote success, signed-out fallback (down/up), database down, server message preserved and expired session all honest; old copy caught by the predicate and its mutant killed; Settings card uses the same copy with "Sincronização pendente"; ${required.length} card strings translated to English within the translator limit.`);
