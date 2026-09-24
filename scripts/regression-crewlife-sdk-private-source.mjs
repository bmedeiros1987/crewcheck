import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/crewlife-samsung-companion.yml', 'utf8');
const expectedSha256 = 'f5d3d83cf00b97d0bb1b1db4da076e861eb1c3e6e704d89a34e68909d2f38654';

assert.match(
  workflow,
  /SAMSUNG_HEALTH_DATA_AAR_URL/,
  'Samsung-enabled CI must source the proprietary SDK only from an explicit private artifact URL',
);
assert.match(
  workflow,
  new RegExp(expectedSha256),
  'Samsung Health Data SDK 1.1.0 must be pinned to the owner-verified SHA-256',
);
assert.match(
  workflow,
  /SAMSUNG_SDK_READY=false/,
  'missing private SDK infrastructure must fail closed to architecture-only validation',
);
assert.doesNotMatch(
  workflow,
  /git\s+(?:fetch|show)[\s\S]{0,500}samsung-health-data-api/i,
  'CI must never recover the proprietary Samsung SDK from repository history',
);
assert.doesNotMatch(
  workflow,
  /scripts\/crewlife-wellness\/native\/libs\/samsung-health-data-api/i,
  'CI must not reference a historical repository path containing the proprietary AAR',
);
assert.doesNotMatch(
  workflow,
  /pinned validated repository history|historical blob/i,
  'workflow documentation must not normalize redistribution from repository history',
);

console.log('PASS CrewLife Samsung SDK private-source-only policy');
