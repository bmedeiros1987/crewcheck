import assert from 'node:assert/strict';
import {
  compareActiveRosterIdentity,
  reconcileActiveRosterIdentity,
} from '../shared/activeRosterIdentity.mjs';

const apkCorrect = {
  id: 'local-aug-2026-current',
  checksum: 'aug-current-checksum',
  year: 2026,
  month: 8,
  createdAt: '2026-08-01T21:00:00.000Z',
  sourceFileName: 'CrewRosterReport-agosto.pdf',
};

const webStale = {
  id: 'remote-aug-2026-old',
  checksum: 'aug-old-checksum',
  year: 2026,
  month: 8,
  createdAt: '2026-07-28T12:00:00.000Z',
  sourceFileName: 'CrewRosterReport-agosto-antigo.pdf',
};

const conflict = compareActiveRosterIdentity(webStale, apkCorrect);
assert.equal(conflict.status, 'conflict');
assert.equal(conflict.reason, 'checksum-mismatch');
assert.equal(conflict.same, false);

const decision = reconcileActiveRosterIdentity({ remote: webStale, local: apkCorrect });
assert.equal(decision.decision, 'confirm');
assert.equal(decision.source, 'conflict');

const sameChecksum = reconcileActiveRosterIdentity({
  remote: { ...apkCorrect, id: 'remote-copy' },
  local: apkCorrect,
});
assert.equal(sameChecksum.decision, 'use-canonical');
assert.equal(sameChecksum.comparison.reason, 'checksum');

const sameMonthNoIdentity = reconcileActiveRosterIdentity({
  remote: { year: 2026, month: 8, createdAt: '2026-08-01T10:00:00Z' },
  local: { year: 2026, month: 8, createdAt: '2026-08-01T11:00:00Z' },
});
assert.equal(sameMonthNoIdentity.decision, 'confirm');
assert.equal(sameMonthNoIdentity.comparison.status, 'ambiguous');

const remoteOnly = reconcileActiveRosterIdentity({ remote: webStale, local: null });
assert.equal(remoteOnly.decision, 'use-remote');

const localOnly = reconcileActiveRosterIdentity({ remote: null, local: apkCorrect });
assert.equal(localOnly.decision, 'use-local');

console.log('[active-roster-identity] OK — conflitos APK/Web não escolhem snapshot silenciosamente.');
