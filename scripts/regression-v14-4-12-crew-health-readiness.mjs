import assert from 'node:assert/strict';
import { buildCrewHealthReadiness, crewHealthReadinessCapabilities } from '../server/v1412/crewHealthReadiness.mjs';

const capabilities = crewHealthReadinessCapabilities();
assert.equal(capabilities.surface, 'CREWCHECK_NATIVE');
assert.equal(capabilities.privacy.fullVaccinationHistoryRequired, false);
assert.equal(capabilities.privacy.minimumOperationalStatusOnly, true);
assert.ok(capabilities.documents.some((item) => item.type === 'CIVP_YELLOW_FEVER'));

const missing = buildCrewHealthReadiness({ internationalDuty: true });
assert.equal(missing.status, 'BLOCKED');
assert.equal(missing.action, 'OBTAIN_OR_STORE_CIVP');
assert.equal(missing.privacy.vaccinationHistoryShared, false);

const stored = buildCrewHealthReadiness({
  internationalDuty: true,
  civp: { present: true, verification: 'VERIFIED', vaccinationDate: '2019-05-10' },
  at: '2026-09-07T12:00:00Z'
});
assert.equal(stored.status, 'READY');
assert.equal(stored.operationalReady, true);
assert.equal(stored.document.validFrom, '2019-05-20');

const tooSoon = buildCrewHealthReadiness({
  internationalDuty: true,
  civp: { present: true, verification: 'VERIFIED', vaccinationDate: '2026-09-03' },
  at: '2026-09-07T12:00:00Z'
});
assert.equal(tooSoon.status, 'BLOCKED');
assert.equal(tooSoon.action, 'WAIT_UNTIL_CIVP_VALID');

console.log('CrewCheck v14.4.12 crew health readiness regression: PASS');
