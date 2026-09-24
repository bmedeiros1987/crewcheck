import assert from 'node:assert/strict';
import fs from 'node:fs';

const offline = fs.readFileSync('client/src/lib/offlineSync.ts', 'utf8');
const historyPatch = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
const activePatch = fs.readFileSync('scripts/v14393/apply.mjs', 'utf8');

// An authenticated cloud failure must stay observable after the roster is already
// persisted locally. Otherwise the caller sees a false success and there is nothing
// to drive a later retry to account storage.
assert.ok(historyPatch.includes('(error as any).localSummary = localSummary;'), 'cloud failure must retain local evidence on the thrown error');
assert.match(historyPatch, /catch \(error\) \{[\s\S]*localSummary[\s\S]*throw error;/, 'authenticated cloud failure must propagate after local persistence');

// Never consume a scoped local queue as "synced" when there is no authenticated
// account token. A logged-out/offline boot must keep the recovery payload pending.
assert.ok(offline.includes("import { getStoredUser, getToken } from './authClient';"), 'offline sync must know whether account auth is present');
assert.ok(offline.includes('if (!getToken()) return { synced: 0, remaining: readQueue().length, errors: [] };'), 'retry must no-op while unauthenticated');

// saveRosterAnalysis activates the server publication. Replaying newest -> oldest
// would finish by re-activating an older roster. Oldest -> newest preserves the most
// recent user import as the final account-active publication.
assert.ok(offline.includes(".sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));"), 'retry order must be oldest to newest');

// Account reconciliation already owns mount/focus/visible/online/interval triggers.
// Flush durable local history before asking for account truth so reinstall/reconnect
// sees the newest successfully uploaded active roster without another PDF import.
assert.ok(activePatch.includes("import { syncPendingRosters } from '@/lib/offlineSync';"), 'active-roster runtime must install durable retry');
const syncAt = activePatch.indexOf("await syncPendingRosters().catch(() => ({ synced: 0, remaining: 0, errors: [] }));");
const openAt = activePatch.indexOf('const active = await openActiveRoster();');
assert.ok(syncAt >= 0 && openAt > syncAt, 'durable retry must happen before openActiveRoster');

console.log('[mobile-active-roster-durable-sync] OK — local-first import retries to account truth before active-roster reconciliation.');
