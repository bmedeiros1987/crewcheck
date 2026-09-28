import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('client/src/lib/offlineSync.ts', 'utf8');

function extract(name) {
  const marker = `function ${name}(`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `${name}() not found`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`${name}() body never closes`);
}

const migrate = extract('migrateLegacyLocalHistoryOnce')
  .replace(/\)\s*:\s*void\s*\{/, ') {');

assert.match(migrate, /removeItem\(LEGACY_LOCAL_HISTORY_KEY\)/, 'ownerless legacy key must be removed');
assert.doesNotMatch(migrate, /localHistoryKey\(/, 'ownerless legacy data must never be promoted into the current identity');
assert.doesNotMatch(migrate, /JSON\.parse\(legacyRaw\)/, 'ownerless legacy payload must not be consumed as active history');
assert.doesNotMatch(migrate, /setItem\(currentKey/, 'must not use first-claimer-wins migration');

const storage = new Map([
  ['crewcheck_local_history_v1', JSON.stringify([{ roster: { crewName: 'Crew A', year: 2026, month: 8, days: [{ date: '2026-08-01' }] } }])],
]);
const localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const LEGACY_LOCAL_HISTORY_KEY = 'crewcheck_local_history_v1';
const LEGACY_LOCAL_HISTORY_MIGRATED_KEY = 'crewcheck_local_history_legacy_migrated_v11';
// eslint-disable-next-line no-new-func
new Function('localStorage', 'LEGACY_LOCAL_HISTORY_KEY', 'LEGACY_LOCAL_HISTORY_MIGRATED_KEY', `${migrate}; migrateLegacyLocalHistoryOnce();`)(localStorage, LEGACY_LOCAL_HISTORY_KEY, LEGACY_LOCAL_HISTORY_MIGRATED_KEY);

assert.equal(storage.has(LEGACY_LOCAL_HISTORY_KEY), false, 'legacy key must be discarded after being handled');
assert.equal(storage.get(LEGACY_LOCAL_HISTORY_MIGRATED_KEY), '1', 'migration marker must prevent repeated handling');
assert.equal([...storage.keys()].some((key) => /^crewcheck_local_history_v11_user-/i.test(key)), false, 'no authenticated identity may receive ownerless legacy history');

console.log('[p1-ownerless-legacy-history-fail-closed] OK — ownerless legacy roster history is discarded, never promoted to the first authenticated identity.');
