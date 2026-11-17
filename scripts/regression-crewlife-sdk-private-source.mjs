import assert from 'node:assert/strict';
import fs from 'node:fs';

const expectedSha256 = 'f5d3d83cf00b97d0bb1b1db4da076e861eb1c3e6e704d89a34e68909d2f38654';
const workflows = [
  {
    name: 'CrewLife Samsung companion',
    path: '.github/workflows/crewlife-samsung-companion.yml',
    architectureOnlyWhenMissing: true,
  },
  {
    name: 'CrewLife Companion Play',
    path: '.github/workflows/crewlife-companion-play.yml',
    architectureOnlyWhenMissing: false,
  },
];

for (const candidate of workflows) {
  const workflow = fs.readFileSync(candidate.path, 'utf8');

  assert.match(
    workflow,
    /SAMSUNG_HEALTH_DATA_AAR_URL/,
    `${candidate.name} must source the proprietary SDK only from an explicit private artifact URL`,
  );
  assert.match(
    workflow,
    new RegExp(expectedSha256),
    `${candidate.name} must pin Samsung Health Data SDK 1.1.0 to the owner-verified SHA-256`,
  );
  assert.doesNotMatch(
    workflow,
    /git\s+(?:fetch|show)[\s\S]{0,500}samsung-health-data-api/i,
    `${candidate.name} must never recover the proprietary Samsung SDK from repository history`,
  );
  assert.doesNotMatch(
    workflow,
    /scripts\/crewlife-wellness\/native\/libs\/samsung-health-data-api/i,
    `${candidate.name} must not reference a historical repository path containing the proprietary AAR`,
  );
  assert.doesNotMatch(
    workflow,
    /pinned validated repository history|historical blob/i,
    `${candidate.name} must not normalize redistribution from repository history`,
  );

  if (candidate.architectureOnlyWhenMissing) {
    assert.match(
      workflow,
      /SAMSUNG_SDK_READY=false/,
      `${candidate.name} must fail closed to architecture-only validation when private SDK infrastructure is missing`,
    );
  }
}

const playWorkflow = fs.readFileSync('.github/workflows/crewlife-companion-play.yml', 'utf8');
assert.match(
  playWorkflow,
  /scripts\/regression-crewlife-sdk-private-source\.mjs/,
  'Play workflow path filters must include the private-SDK sourcing regression',
);
assert.match(
  playWorkflow,
  /node scripts\/regression-crewlife-sdk-private-source\.mjs/,
  'Play workflow must execute the private-SDK sourcing regression before building or publishing',
);
assert.match(
  playWorkflow,
  /id:\s*sdk[\s\S]*?ready=false[\s\S]*?GITHUB_OUTPUT[\s\S]*?ready=true[\s\S]*?GITHUB_OUTPUT/,
  'Play workflow must export whether a verified private SDK was actually restored',
);
assert.match(
  playWorkflow,
  /outputs:\s*\n\s+sdk_ready:\s*\$\{\{\s*steps\.sdk\.outputs\.ready\s*\}\}/,
  'Play build job must expose SDK readiness to the publish job',
);
assert.match(
  playWorkflow,
  /publish-internal:[\s\S]*needs\.build\.outputs\.sdk_ready\s*==\s*'true'/,
  'Internal Testing publication must be impossible when the verified private SDK is unavailable',
);
assert.match(
  playWorkflow,
  /publish-internal:[\s\S]*github\.event_name\s*==\s*'workflow_dispatch'[\s\S]*inputs\.publish_internal/,
  'CrewLife Internal Testing publication must require explicit manual dispatch',
);
const publishCondition = playWorkflow.split('publish-internal:', 2)[1].split('runs-on:', 1)[0];
assert.doesNotMatch(
  publishCondition,
  /github\.event_name\s*==\s*'push'/,
  'CrewLife publication must never run merely because main received a push',
);
for (const name of ['Install Play API client', 'Allocate live Companion version']) {
  const stepStart = playWorkflow.indexOf(`      - name: ${name}\n`);
  assert.ok(stepStart >= 0, `Missing Play step: ${name}`);
  const step = playWorkflow.slice(stepStart).split('\n      - ', 1)[0];
  const condition = step.match(/\n        if:\s*([^\n]+)/)?.[1];
  assert.ok(condition, `Missing Play condition: ${name}`);
  assert.match(condition, /env\.SAMSUNG_SDK_READY\s*==\s*'true'/,
    `${name} must require a verified private Samsung SDK`);
  const evaluate = new Function('github', 'inputs', 'env', `return (${condition});`);
  for (const ready of ['false', '', undefined]) {
    assert.equal(evaluate({ref: 'refs/heads/main', event_name: 'workflow_dispatch'},
      {publish_internal: true}, {SAMSUNG_SDK_READY: ready}), false,
      `${name} must refuse missing/unverified SDK even with manual publication requested`);
  }
  assert.equal(evaluate({ref: 'refs/heads/main', event_name: 'workflow_dispatch'},
    {publish_internal: true}, {SAMSUNG_SDK_READY: 'true'}), true,
    `${name} must preserve the verified-SDK explicit manual path`);
}

console.log('PASS CrewLife Samsung SDK private-source-only policy across build and Play workflows');
