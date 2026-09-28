import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const emergency = read('server/v1391/emergency.mjs');
const view = read('client/src/components/v1391/EmergencyCenterView.tsx');
const css = read('client/src/components/v1395/v1395.css');
const server = read('server.mjs');
const migration = read('migrations/20260716_007_v1395_medical_emergency_care.sql');
const render = read('render.yaml');
const metadata = JSON.parse(read('package.json'));

assert.match(metadata.version, /^(?:13\.9\.\d+|14\.0\.\d+)$/);
assert.match(emergency, /ensureEmergencySchema/);
assert.match(emergency, /CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_profiles/);
assert.match(emergency, /CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_sessions/);
assert.match(emergency, /CREATE TABLE IF NOT EXISTS crewcheck_platform_emergency_responses/);
assert.match(emergency, /healthPlanProvider/);
assert.match(emergency, /healthPlanCode/);
assert.match(emergency, /openNow: true/);
assert.match(emergency, /cc_emergency_help:/);
assert.match(emergency, /cc_emergency_ok:/);
assert.match(emergency, /request_location: true/);
assert.match(emergency, /registeredHotelsReply/);
assert.match(emergency, /UBER_CLIENT_ID/);
assert.match(emergency, /VALUES\(\?,\?,\?,'active',\?,\?,\?,\?\)/);
assert.doesNotMatch(emergency, /VALUES\(\?,\?,\?,'active',\?,\?,\?,\?,\?\)/);
assert.match(view, /profilePayload\?\.saved/);
assert.match(view, /healthPlanProvider/);
assert.match(view, /cc139-delivery-report/);
assert.match(view, /\/api\/platform\/emergency\/assisted/);
assert.match(css, /input\[type='checkbox'\]/);
assert.match(server, /command: 'hospitais'/);
assert.match(server, /command: 'farmacias'/);
assert.match(server, /command: 'plano'/);
assert.match(migration, /20260716_007/);
assert.match(render, /UBER_CLIENT_ID/);

const secretPattern = /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/;
for (const [path, source] of [['emergency.mjs', emergency], ['EmergencyCenterView.tsx', view], ['server.mjs', server]]) {
  assert.doesNotMatch(source, secretPattern, `Telegram token must not be committed in ${path}`);
}

console.log('CrewCheck medical profile, coordinated emergency and open care regression OK.');
