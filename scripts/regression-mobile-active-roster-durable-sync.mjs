import assert from 'node:assert/strict';
import fs from 'node:fs';

const activePatch = fs.readFileSync('scripts/v14393/apply.mjs', 'utf8');
const identityPatch = fs.readFileSync('scripts/p0-580-local-period-identity/apply.mjs', 'utf8');

// Existing P0_580 behavior is authoritative: an unavailable account backend must not
// make a locally persisted import look failed. Recovery is driven by unsynced local
// history on the next authenticated reconciliation opportunity.
assert.ok(identityPatch.includes('const offlineLocalSuccess = `  } catch {'), 'offline-local save compatibility must be explicitly restored');
assert.ok(identityPatch.includes('return localSummary;'), 'offline import must remain locally successful');

// Revisions of the same published month must not share the old period-only checksum.
// Keep P0_580's verified-identity boundary authoritative: content differentiates a
// revision only after the crew identity has been accepted by that guard.
assert.ok(identityPatch.includes('function localRosterRevisionChecksum(roster: CrewRoster, periodIdentity: string): string {'), 'identity guard needs a content-aware revision checksum');
assert.ok(identityPatch.includes('checksum: String(payload.checksum || (periodIdentity ? localRosterRevisionChecksum(roster, periodIdentity)'), 'verified local history must persist revision-aware checksum');
assert.ok(identityPatch.includes('unverified:'), 'unverified identities must remain fail-closed and unique');
assert.ok(identityPatch.includes('identitySlug'), 'unverified identity fallback must retain scoped identity evidence');

// Never consume a scoped local queue as "synced" when there is no authenticated
// account token. The active-roster runtime must guard recovery with the actual token.
assert.ok(activePatch.includes("import { authFetch, getStoredUser, getToken, logout } from '@/lib/authClient';"), 'active-roster runtime must retain a real auth-token gate');
assert.ok(activePatch.includes('if (getToken()) {'), 'retry must not run while unauthenticated');

// saveRosterAnalysis activates the server publication. Replaying newest -> oldest
// would finish by re-activating an older roster. Oldest -> newest preserves the most
// recent user import as the final account-active publication.
assert.ok(activePatch.includes(".sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));"), 'retry order must be oldest to newest');

// Account reconciliation already owns mount/focus/visible/online/interval triggers.
// Flush durable local history before asking for account truth so reinstall/reconnect
// sees the newest successfully uploaded active roster without another PDF import.
assert.ok(activePatch.includes("import { syncPendingRosters } from '@/lib/offlineSync';"), 'active-roster runtime must install durable retry');
const syncAt = activePatch.indexOf("await syncPendingRosters().catch(() => ({ synced: 0, remaining: 0, errors: [] }));");
const openAt = activePatch.indexOf('const active = await openActiveRoster();');
assert.ok(syncAt >= 0 && openAt > syncAt, 'durable retry must happen before openActiveRoster');

// This slice must stay at persistence/reconciliation level. Aviation semantics are
// deliberately not implemented here.
for (const forbidden of ['parseAimsTokensIntoEventsV3', 'publishedPresentationOf', 'financialJourneyGroupKey']) {
  assert.equal(activePatch.includes(forbidden), false, `must not touch canonical aviation rule: ${forbidden}`);
  assert.equal(identityPatch.includes(forbidden), false, `identity patch must not touch canonical aviation rule: ${forbidden}`);
}

console.log('[mobile-active-roster-durable-sync] OK — local-first import stays successful offline and retries to account truth before reconciliation.');
