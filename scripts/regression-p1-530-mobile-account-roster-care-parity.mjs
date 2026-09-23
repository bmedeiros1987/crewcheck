import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('client/src/pages/Home.tsx', 'utf8');
const database = await readFile('client/src/lib/databaseClient.ts', 'utf8');
const roster = await readFile('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');

// This regression is intentionally run AFTER the canonical v139 preparation.
// The shipped runtime already has v14.3.93 reconciliation on mount/focus/visible/
// interval. The real cross-surface blocker is subtler: v14.3.71 detects a
// different local checksum as ACTIVE_ROSTER_CONFLICT, while v14.3.93 swallows
// that error and leaves the stale device publication forever. TV has no local
// cache conflict and reads the account-active database row, explaining TV=correct
// while mobile can remain on an older same-month publication.
assert.match(
  home,
  /const reconcileActiveRoster = async \(reason: 'mount' \| 'focus' \| 'visible' \| 'interval'\) =>/,
  'prepared mobile runtime must keep the existing cross-channel reconciler',
);
assert.match(
  database,
  /ACTIVE_ROSTER_CONFLICT/,
  'prepared database client must retain the existing fail-closed conflict detection',
);
assert.match(
  database,
  /remoteCandidate/,
  'when an authenticated account-active row conflicts with local cache, the error must carry that verified remote candidate for the account-sync consumer',
);

// Cross-period safety is a separate gate from same-period checksum conflict.
// A September account-active row must never be silently adopted over an August
// device publication merely because both have stable but different checksums.
// The account-sync exception is intentionally limited to the same reference period.
assert.match(
  database,
  /const remoteIdentity = reconciliation\.comparison\.left;[\s\S]*const localIdentity = reconciliation\.comparison\.right;[\s\S]*const sameReferencePeriod = remoteIdentity\.year !== null[\s\S]*remoteIdentity\.month === localIdentity\.month;/,
  'prepared database client must explicitly prove remote/local reference-period equality before exposing a remoteCandidate',
);
assert.match(
  database,
  /if \(!sameReferencePeriod\) \{[\s\S]*ROSTER_PERIOD_MISMATCH[\s\S]*throw mismatch;/,
  'cross-period active-roster conflicts must remain fail-closed as ROSTER_PERIOD_MISMATCH',
);

assert.match(
  home,
  /ACTIVE_ROSTER_CONFLICT/,
  'mobile account-sync consumer must explicitly adjudicate the known active-roster conflict instead of swallowing it',
);
assert.match(
  home,
  /remoteCandidate/,
  'mobile account-sync consumer must use only the verified remote candidate attached by openActiveRoster',
);
assert.match(
  home,
  /preservePlannedRosterBeforeImport\(bundle, remote\.roster\)/,
  'before replacing a conflicting local publication, mobile must preserve the prior same-period version for comparison',
);
assert.match(
  home,
  /saveRoster\(remote\.roster, 'Escala ativa sincronizada'\)/,
  'verified account-active publication must become the mobile active cache after conflict adjudication',
);

// Care Mode parity: the owner-supplied September source publishes VC on 17-30 Sep.
// Mobile Roster must not collapse VC into the generic "Descanso publicado" copy.
assert.match(
  roster,
  /carePresentationForScheduleActivity/,
  'Roster must consume the shared Care Mode authority already used by FlightDeck/Concierge',
);
assert.match(
  roster,
  /presentation\?\.state === 'FERIAS'/,
  'Roster must expose an explicit vacation presentation path',
);
assert.match(
  roster,
  /carePresentation\?\.label \|\| meta\.label/,
  'Roster card eyebrow must say Férias/Luto/Folga/Repouso when Care authority exists',
);

console.log('PASS P1 #530 mobile account-active conflict + Care Mode parity (prepared runtime)');
