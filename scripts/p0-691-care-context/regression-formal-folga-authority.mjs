import assert from 'node:assert/strict';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from '../lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-p0-691-formal-folga-authority-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: ['client/src/lib/scheduleActivityClassification.ts'],
});

const classification = harness.load('scheduleActivityClassification');

for (const residualPairing of ['VC', 'DMO']) {
  const item = {
    kind: 'rest',
    type: 'FOLGA',
    code: 'FOLGA',
    pairingCode: residualPairing,
    canonical: {
      kind: 'rest',
      code: 'FOLGA',
      publishedDay: { type: 'FOLGA', pairingCode: residualPairing, legs: [] },
    },
    day: { type: 'FOLGA', pairingCode: residualPairing, legs: [] },
  };
  const before = JSON.stringify(item);
  assert.equal(
    classification.careStateForScheduleActivity(item),
    'FOLGA',
    `formal FOLGA must outrank residual ${residualPairing}; only coarse DO may be specialized`,
  );
  assert.equal(
    classification.carePresentationForScheduleActivity(item)?.label,
    'Folga',
    `formal FOLGA + residual ${residualPairing} must stay visibly Folga`,
  );
  assert.equal(classification.isProgramScheduleActivity(item), false, 'formal Folga remains non-operational');
  assert.equal(classification.isSmartDepartureEligible(item), false, 'formal Folga never opens Smart Departure');
  assert.equal(JSON.stringify(item), before, 'consumer classification must not mutate canonical input');
}

harness.cleanup();
console.log('OK regression-formal-folga-authority');
