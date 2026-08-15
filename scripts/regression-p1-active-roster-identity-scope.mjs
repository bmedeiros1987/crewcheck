import assert from 'node:assert/strict';
import fs from 'node:fs';

// Root cause this fixes (#440 / #303, "cache vencer a escala ativa do servidor"):
// client/src/lib/databaseClient.ts's readLocalActiveRosterSnapshots() and
// localHistoryKeys() unconditionally included the 'anon' scope, several hardcoded
// legacy/unscoped keys from old version numbers, and additionally scanned the
// *entire* localStorage for any key matching a broad pattern - merging every match
// found, deduplicated only by checksum, never by identity.
//
// This matters far beyond history/recovery: openActiveRoster() (the exported
// bootstrap entry point for the active roster) calls getSmartLocalActiveRosterSummary()
// as its fallback whenever the live GET /api/rosters/active call fails - exactly the
// "erro de carregamento" scenario #440 reports. getSmartLocalActiveRosterSummary()
// is built from getLocalRosterSummaries(), which is built from
// readLocalActiveRosterSnapshots() + readLocalHistory() - both of which had this
// cross-identity leak. On a shared/reused device, or after an account switch on the
// same device, a failed load could therefore surface a *different* identity's
// cached roster as if it were the active one: the concrete, reproducible mechanism
// this issue calls "teletransporte".
//
// Fixed the same way as the parallel bug already fixed in client/src/lib/offlineSync.ts:
// scope reads to the current identity's own keys only.
//
// #303 follow-up: the original fix here (and in offlineSync.ts) still promoted the
// ownerless legacy key into whichever scope asked for it *first* - a "first-claimer
// wins" migration. PR #493 closed that same leak in offlineSync.ts by discarding the
// legacy key outright instead of ever attaching it to an identity; this test now
// verifies databaseClient.ts's two legacy migrations (ACTIVE_ROSTER_LEGACY_KEYS and
// LEGACY_LOCAL_HISTORY_KEY) were brought in line the same way - ownerless data is
// always discarded, never adopted by the first bootstrap.
//
// This test extracts and actually executes the real functions from the current
// source (not a reimplementation), the same technique used by
// regression-getme-error-differentiation.mjs and
// regression-p1-offline-history-identity-scope.mjs, so it cannot silently drift from
// what's shipped.

const src = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');

function braceSpan(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unterminated brace starting at ${openIndex}`);
}

function extract(name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${name}() not found in databaseClient.ts`);
  // Find the parameter list's closing paren first (tracking paren depth), so a
  // TypeScript return type - which may itself be an object-literal type like
  // "): { first: Date | null } {" - can't be mistaken for the function body.
  const parenOpen = src.indexOf('(', start);
  let depth = 0;
  let parenClose = -1;
  for (let i = parenOpen; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) { parenClose = i; break; }
    }
  }
  assert.ok(parenClose >= 0, `${name}() parameter list never closes`);
  // Everything between the params and the body is either nothing, ": Type", or
  // ": { ...object literal type... }". Try the first '{' after the params; if a
  // second '{' immediately follows that group's close, the first one was just the
  // return-type literal, not the body.
  let candidate = src.indexOf('{', parenClose);
  assert.ok(candidate >= 0, `${name}() has no body`);
  let candidateEnd = braceSpan(src, candidate);
  const between = src.slice(parenClose + 1, candidate);
  if (/:\s*$/.test(between)) {
    // The '{' we found opens a return-type object literal, not the body - the
    // real body starts at the next '{' after it closes.
    const next = src.indexOf('{', candidateEnd + 1);
    assert.ok(next >= 0, `${name}() has no body after its return-type literal`);
    candidate = next;
    candidateEnd = braceSpan(src, candidate);
  }
  // Reconstruct with the return-type annotation (whatever shape it took) removed
  // outright, instead of trying to regex-strip it later - object-literal return
  // types contain their own braces/colons and aren't safe to pattern-match.
  return `${src.slice(start, parenClose + 1)} {${src.slice(candidate + 1, candidateEnd)}}`;
}

function stripTsSyntax(fnSource) {
  return fnSource
    .replace(/\(([^)]*)\)/, (all, params) => `(${params.replace(/:\s*[A-Za-z0-9_<>[\]| .]+(?=,|$)/g, '')})`)
    .replace(/\b(const|let)\s+([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_<>[\]| .]+(?=\s*[=;])/g, '$1 $2')
    .replace(/\s+as\s+[A-Za-z0-9_<>[\]| .]+(?=[),;])/g, '')
    .replace(/<[A-Za-z0-9_, [\]|.]+>(?=\()/g, '')
    // arrow-function parameter type annotations: (a: any) => ... / (a: any, b: Foo) =>
    .replace(/\(([^()]*)\)(\s*=>)/g, (all, params, arrow) => `(${params.replace(/:\s*[A-Za-z0-9_<>[\]| .]+(?=,|$)/g, '')})${arrow}`);
}

const names = [
  'safeStorageScope',
  'migrateLegacyLocalHistoryOnce',
  'localHistoryKeys',
  'normalizeLocalHistoryItem',
  'readLocalHistory',
  'migrateLegacyActiveRosterSnapshotsOnce',
  'readLocalActiveRosterSnapshots',
  'periodHistoryKey',
  'getLocalRosterSummaries',
  'rosterSummaryBounds',
  'getSmartLocalActiveRosterSummary',
];
const localHistoryKeyBody = extract('localHistoryKey');
const extracted = Object.fromEntries(names.map((name) => [name, stripTsSyntax(extract(name))]));

const legacyKeyMatch = src.match(/const LEGACY_LOCAL_HISTORY_KEY = '([^']+)';/);
assert.ok(legacyKeyMatch, 'LEGACY_LOCAL_HISTORY_KEY constant not found');
const historyMigratedMatch = src.match(/const LOCAL_HISTORY_LEGACY_MIGRATED_KEY = '([^']+)';/);
assert.ok(historyMigratedMatch, 'LOCAL_HISTORY_LEGACY_MIGRATED_KEY constant not found');
const activeLegacyKeysMatch = src.match(/const ACTIVE_ROSTER_LEGACY_KEYS = \[([\s\S]*?)\];/);
assert.ok(activeLegacyKeysMatch, 'ACTIVE_ROSTER_LEGACY_KEYS array not found');
const activeMigratedMatch = src.match(/const ACTIVE_ROSTER_LEGACY_MIGRATED_KEY = '([^']+)';/);
assert.ok(activeMigratedMatch, 'ACTIVE_ROSTER_LEGACY_MIGRATED_KEY constant not found');

const harnessSource = `
const LEGACY_LOCAL_HISTORY_KEY = ${JSON.stringify(legacyKeyMatch[1])};
const LOCAL_HISTORY_LEGACY_MIGRATED_KEY = ${JSON.stringify(historyMigratedMatch[1])};
const ACTIVE_ROSTER_LEGACY_KEYS = [${activeLegacyKeysMatch[1]}];
const ACTIVE_ROSTER_LEGACY_MIGRATED_KEY = ${JSON.stringify(activeMigratedMatch[1])};
function localHistoryKey${localHistoryKeyBody.slice('function localHistoryKey'.length)}
${extracted.safeStorageScope}
${extracted.migrateLegacyLocalHistoryOnce}
${extracted.localHistoryKeys}
${extracted.normalizeLocalHistoryItem}
${extracted.readLocalHistory}
${extracted.migrateLegacyActiveRosterSnapshotsOnce}
${extracted.readLocalActiveRosterSnapshots}
${extracted.periodHistoryKey}
${extracted.getLocalRosterSummaries}
${extracted.rosterSummaryBounds}
${extracted.getSmartLocalActiveRosterSummary}
return { getSmartLocalActiveRosterSummary, readLocalActiveRosterSnapshots, localHistoryKey, getLocalRosterSummaries };
`;

class LocalStorageMock {
  constructor() { this.store = new Map(); }
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
  setItem(k, v) { this.store.set(k, String(v)); }
  removeItem(k) { this.store.delete(k); }
  key(i) { return Array.from(this.store.keys())[i] ?? null; }
  get length() { return this.store.size; }
}

function buildHarness(localStorage, getStoredUser) {
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', 'getStoredUser', harnessSource);
  return factory(localStorage, getStoredUser);
}

function activeSnapshot(crewName, year, month) {
  return { checksum: `${crewName}:${year}:${String(month).padStart(2, '0')}`, createdAt: new Date().toISOString(), sourceFileName: 'x.pdf', roster: { crewName, year, month, days: [{ date: `${year}-${String(month).padStart(2, '0')}-01` }] }, compliance: { score: 0, alerts: [] }, gym: [] };
}

// --- Scenario 1: user B's cached active-roster snapshot must never surface as
// user A's fallback active roster (the exact mechanism openActiveRoster() relies on
// when the live server call fails). ---
{
  const storage = new LocalStorageMock();
  const bHarness = buildHarness(storage, () => ({ id: 'user-b' }));
  storage.setItem(`crewcheck_active_roster_snapshot_${bHarness.getSmartLocalActiveRosterSummary ? '' : ''}user-b`, ''); // no-op, keep linter calm
  const bScopeKey = 'crewcheck_active_roster_snapshot_user-b';
  storage.setItem(bScopeKey, JSON.stringify(activeSnapshot('Crew B', 2026, 8)));

  const aHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  const aSummary = aHarness.getSmartLocalActiveRosterSummary();
  assert.equal(aSummary, undefined, "A must not receive B's cached active-roster snapshot as a fallback");
}

// --- Scenario 2: 'anon' active-roster snapshot must not be folded in once a real
// user is authenticated. ---
{
  const storage = new LocalStorageMock();
  storage.setItem('crewcheck_active_roster_snapshot_anon', JSON.stringify(activeSnapshot('Crew Anon', 2026, 8)));
  const authedHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  const summary = authedHarness.getSmartLocalActiveRosterSummary();
  assert.equal(summary, undefined, 'an authenticated session must not inherit the anon-scope active-roster snapshot');
}

// --- Scenario 3: legacy version-numbered active-roster keys (ownerless, pre-scoping)
// must be discarded fail-closed - never adopted by whichever scope boots first. This
// is the exact fallback openActiveRoster() uses when the live GET /api/rosters/active
// call fails, so this scenario simulates that failure by exercising the same fallback
// candidate directly. ---
{
  const storage = new LocalStorageMock();
  storage.setItem('crewcheck_last_roster_bundle_v11108', JSON.stringify(activeSnapshot('Crew Legacy', 2026, 7)));

  const aHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  const aSummary = aHarness.getSmartLocalActiveRosterSummary();
  assert.equal(aSummary, undefined, 'no scope may ever adopt an ownerless legacy active-roster snapshot as its active roster fallback');
  assert.equal(storage.getItem('crewcheck_last_roster_bundle_v11108'), null, 'ownerless legacy key must still be discarded (marked handled) the first time it is seen');

  const bHarness = buildHarness(storage, () => ({ id: 'user-b' }));
  const bSummary = bHarness.getSmartLocalActiveRosterSummary();
  assert.equal(bSummary, undefined, 'a second scope must not receive the discarded legacy active-roster snapshot either');
}

// --- Scenario 3b: the general legacy local-history key (crewcheck_local_history_v1,
// consumed via readLocalHistory()->localHistoryKeys()) is the *other* ownerless
// source getSmartLocalActiveRosterSummary() draws from - must be fail-closed too. ---
{
  const storage = new LocalStorageMock();
  storage.setItem('crewcheck_local_history_v1', JSON.stringify([activeSnapshot('Crew Legacy History', 2026, 6)]));

  const aHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  const aSummary = aHarness.getSmartLocalActiveRosterSummary();
  assert.equal(aSummary, undefined, 'no scope may ever adopt ownerless legacy local-history entries as its active roster fallback');
  assert.equal(storage.getItem('crewcheck_local_history_v1'), null, 'ownerless legacy history key must still be discarded the first time it is seen');

  const bHarness = buildHarness(storage, () => ({ id: 'user-b' }));
  assert.equal(bHarness.getSmartLocalActiveRosterSummary(), undefined, 'a second scope must not receive the discarded legacy history either');
}

// --- Scenario 4: A's own current-scope snapshot still works normally (the fix must
// not break the legitimate same-user fallback path) - data already correctly scoped
// to the current identity is preserved, only ownerless legacy data is discarded. ---
{
  const storage = new LocalStorageMock();
  const aHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  storage.setItem('crewcheck_active_roster_snapshot_user-a', JSON.stringify({ ...activeSnapshot('Crew A', 2026, 8), isActive: true }));
  const summary = aHarness.getSmartLocalActiveRosterSummary();
  assert.ok(summary, "A's own snapshot must still be usable as a fallback");
  assert.equal(summary.crewName, 'Crew A');
}

// --- Scenario 4b: same preservation guarantee for the current-scope local-history
// key (not the legacy/ownerless one). ---
{
  const storage = new LocalStorageMock();
  const aHarness = buildHarness(storage, () => ({ id: 'user-a' }));
  storage.setItem('crewcheck_local_history_v11_user-a', JSON.stringify([{ ...activeSnapshot('Crew A History', 2026, 5), isActive: true }]));
  const summary = aHarness.getSmartLocalActiveRosterSummary();
  assert.ok(summary, "A's own correctly-scoped local-history entry must still be usable as a fallback");
  assert.equal(summary.crewName, 'Crew A History');
}

// --- Guards against regressing to a permissive localStorage scan or to promoting
// ownerless legacy content into any scope. ---
for (const [label, fnSource] of [['localHistoryKeys', extracted.localHistoryKeys], ['readLocalActiveRosterSnapshots', extracted.readLocalActiveRosterSnapshots]]) {
  assert.doesNotMatch(fnSource, /for\s*\(\s*let\s+i\s*=\s*0\s*;\s*i\s*<\s*localStorage\.length/, `${label}() must not regress to scanning all of localStorage`);
}
assert.doesNotMatch(extracted.readLocalActiveRosterSnapshots, /'crewcheck_active_roster_snapshot_anon'/, 'must not unconditionally include the anon active-roster snapshot key');
assert.doesNotMatch(extracted.migrateLegacyActiveRosterSnapshotsOnce, /setItem\(targetKey/, 'ownerless legacy active-roster snapshots must never be written into any scope\'s target key (first-claimer-wins regression)');
assert.doesNotMatch(extracted.migrateLegacyLocalHistoryOnce, /localHistoryKey\(/, 'ownerless legacy history must never be promoted into the current identity (first-claimer-wins regression)');
assert.doesNotMatch(extracted.migrateLegacyLocalHistoryOnce, /JSON\.parse\(legacyRaw\)/, 'ownerless legacy history payload must not be consumed as active history');

console.log('[p1-active-roster-identity-scope] OK — the active-roster bootstrap fallback never crosses user identities, and ownerless legacy keys are discarded fail-closed, never adopted.');
