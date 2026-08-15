import assert from 'node:assert/strict';
import fs from 'node:fs';

// Root cause this fixes (#440): client/src/lib/offlineSync.ts's localHistoryKeys()
// unconditionally included the 'anon' scope key and the unscoped pre-scoping legacy
// key, and additionally scanned the *entire* localStorage for any key matching
// /^crewcheck_local_history_/i, merging every match it found (deduplicated only by
// checksum). On a shared/reused device, or after an account switch, this reintroduced
// a different identity's saved roster history into the active session's recovery/
// backfill path (readLocalHistory(), used by rememberLocalHistory() and
// syncPendingRosters()) - a concrete, reproducible mechanism for "old schedule
// reappears" / "teleport" symptoms reported in #440, entirely separate from the
// canonical parser.
//
// Fixed by scoping localHistoryKeys() to exactly the current identity's own key, and
// replacing the permanent cross-scope scan with a one-shot, removable migration of the
// legacy unscoped key: migrateLegacyLocalHistoryOnce() claims it (if present) into
// whichever scope asks first, then deletes it - so it can never be read by a second
// scope later, i.e. it can never become a permanent merge.
//
// This test extracts and actually executes the real functions from the current source
// (not a reimplementation), the same technique already used by
// regression-getme-error-differentiation.mjs, so it cannot silently drift from what's
// shipped. TypeScript-only syntax (parameter/return type annotations) is stripped with
// targeted regexes limited to the exact patterns these functions use; the goal is to
// run the real logic, not to build a general TS-to-JS transpiler.

const src = fs.readFileSync('client/src/lib/offlineSync.ts', 'utf8');

function extract(name, source = src) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name}() not found in offlineSync.ts`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `${name}() has no body`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name}() body never closes`);
}

function stripTsSyntax(fnSource) {
  return fnSource
    // parameter/return type annotations: (x: Foo): Bar { -> (x): Bar { first, then strip return type
    .replace(/\)\s*:\s*[A-Za-z0-9_<>[\]| ]+\s*\{/, ') {')
    .replace(/\(([^)]*)\)/, (all, params) => `(${params.replace(/:\s*[A-Za-z0-9_<>[\]| ]+(?=,|$)/g, '')})`)
    // local `const x: Type = ...` / `let x: Type;`
    .replace(/\b(const|let)\s+([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_<>[\]| .]+(?=\s*[=;])/g, '$1 $2')
    // `as Type` assertions, including `as any)` right before a closing paren
    .replace(/\s+as\s+[A-Za-z0-9_<>[\]| .]+(?=[),;])/g, '')
    // generic type arguments on constructors/calls: new Set<string>() -> new Set()
    .replace(/<[A-Za-z0-9_, [\]|.]+>(?=\()/g, '');
}

const storageScopeSrc = stripTsSyntax(extract('storageScope'));
const localHistoryKeySrc = extract('localHistoryKey').replace('export function', 'function').replace(/\)\s*:\s*string\s*\{/, ') {');
const migrateSrc = stripTsSyntax(extract('migrateLegacyLocalHistoryOnce'));
const keysSrc = stripTsSyntax(extract('localHistoryKeys')).replace(/\)\s*:\s*string\[\]\s*\{/, ') {');
const normalizeSrc = stripTsSyntax(extract('normalizeOfflineHistoryItem')).replace(/\)\s*:\s*OfflineRosterPayload \| null\s*\{/, ') {');
const readSrc = stripTsSyntax(extract('readLocalHistory')).replace(/\)\s*:\s*OfflineRosterPayload\[\]\s*\{/, ') {');

const legacyKeyMatch = src.match(/export const LEGACY_LOCAL_HISTORY_KEY = '([^']+)';/);
assert.ok(legacyKeyMatch, 'LEGACY_LOCAL_HISTORY_KEY constant not found');
const migratedKeyMatch = src.match(/const LEGACY_LOCAL_HISTORY_MIGRATED_KEY = '([^']+)';/);
assert.ok(migratedKeyMatch, 'LEGACY_LOCAL_HISTORY_MIGRATED_KEY constant not found');

const harnessSource = `
const LEGACY_LOCAL_HISTORY_KEY = ${JSON.stringify(legacyKeyMatch[1])};
const LEGACY_LOCAL_HISTORY_MIGRATED_KEY = ${JSON.stringify(migratedKeyMatch[1])};
${storageScopeSrc}
${localHistoryKeySrc}
${migrateSrc}
${keysSrc}
${normalizeSrc}
${readSrc}
return { localHistoryKeys, localHistoryKey, readLocalHistory, migrateLegacyLocalHistoryOnce };
`;

class LocalStorageMock {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  key(i) { return Array.from(this.store.keys())[i] ?? null; }
  get length() { return this.store.size; }
}

function historyEntry(crewName, year, month) {
  return { checksum: `${crewName}:${year}:${String(month).padStart(2, '0')}`, createdAt: new Date().toISOString(), sourceFileName: 'x.pdf', roster: { crewName, year, month, days: [{ date: `${year}-${String(month).padStart(2, '0')}-01` }] }, compliance: { score: 0, alerts: [] }, gym: [], attempts: 0 };
}

function buildHarness(localStorage, getStoredUser) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'getStoredUser', harnessSource);
  return factory(localStorage, getStoredUser);
}

// --- Scenario 1: user B's history never appears for user A, even though both saved
// locally on the same device/localStorage. ---
{
  const storage = new LocalStorageMock();
  let currentUser = { id: 'user-a' };
  const { localHistoryKey: keyFn, readLocalHistory: readFn } = buildHarness(storage, () => currentUser);

  // Simulate B saving locally first.
  currentUser = { id: 'user-b' };
  const bKey = buildHarness(storage, () => currentUser).localHistoryKey();
  storage.setItem(bKey, JSON.stringify([historyEntry('Crew B', 2026, 8)]));

  // Now A is the active session.
  currentUser = { id: 'user-a' };
  const aHarness = buildHarness(storage, () => currentUser);
  const aHistoryBeforeSave = aHarness.readLocalHistory();
  assert.equal(aHistoryBeforeSave.length, 0, "A must not see B's history just because both are present in localStorage");

  aHarness.readLocalHistory.length; // no-op reference to keep linter quiet about unused import shape
  storage.setItem(aHarness.localHistoryKey(), JSON.stringify([historyEntry('Crew A', 2026, 8)]));
  const aHistoryAfterSave = aHarness.readLocalHistory();
  assert.equal(aHistoryAfterSave.length, 1, 'A must see A\'s own saved history');
  assert.equal(aHistoryAfterSave[0].roster.crewName, 'Crew A');
}

// --- Scenario 2: 'anon' history must not be folded in once a real user is
// authenticated. ---
{
  const storage = new LocalStorageMock();
  let currentUser = null;
  const anonHarness = buildHarness(storage, () => currentUser);
  storage.setItem(anonHarness.localHistoryKey(), JSON.stringify([historyEntry('Crew Anon', 2026, 8)]));
  assert.equal(anonHarness.localHistoryKey(), 'crewcheck_local_history_v11_anon', 'sanity: anon scope key shape');

  currentUser = { id: 'user-a' };
  const authedHarness = buildHarness(storage, () => currentUser);
  const authedHistory = authedHarness.readLocalHistory();
  assert.equal(authedHistory.length, 0, 'an authenticated session must not inherit the anon-scope history');
}

// --- Scenario 3: the legacy unscoped key is migrated exactly once, into whichever
// scope asks first, and is gone afterward - never merged into a second scope. ---
{
  const storage = new LocalStorageMock();
  storage.setItem('crewcheck_local_history_v1', JSON.stringify([historyEntry('Crew Legacy', 2026, 7)]));

  let currentUser = { id: 'user-a' };
  const aHarness = buildHarness(storage, () => currentUser);
  const aHistory = aHarness.readLocalHistory();
  assert.equal(aHistory.length, 1, 'the first scope to read history should receive the one-shot legacy migration');
  assert.equal(aHistory[0].roster.crewName, 'Crew Legacy');
  assert.equal(storage.getItem('crewcheck_local_history_v1'), null, 'legacy key must be deleted immediately after being claimed');

  currentUser = { id: 'user-b' };
  const bHarness = buildHarness(storage, () => currentUser);
  const bHistory = bHarness.readLocalHistory();
  assert.equal(bHistory.length, 0, 'a second scope must never receive the already-claimed legacy history');
}

// --- Guard against regressing to a permissive localStorage scan or an unconditional
// anon/legacy inclusion. ---
assert.doesNotMatch(keysSrc, /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*localStorage\.length/, 'must not regress to scanning all of localStorage for history keys');
assert.doesNotMatch(keysSrc, /'crewcheck_local_history_v11_anon'/, 'must not unconditionally include the anon scope key');
assert.doesNotMatch(keysSrc, /LEGACY_LOCAL_HISTORY_KEY\)/, 'legacy key must go through the one-shot migration, not be read directly in localHistoryKeys()');

console.log('[p1-offline-history-identity-scope] OK — local roster history never crosses user identities, and the legacy key migrates exactly once.');
