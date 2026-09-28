import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { buildInfobipTtsRequest, normalizeInfobipVoice } from '../server/v1396/infobip.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const policySource = read('client/src/lib/compensationPolicy.ts');
const transformed = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const policy = await import(`data:text/javascript;base64,${Buffer.from(transformed.outputText).toString('base64')}`);
const at = (day, hour, minute) => new Date(2026, 6, day, hour, minute, 0, 0);
const slots = (activity) => policy.classifyAllowanceWindows(activity).map((item) => `${item.iso}:${item.slot}`);

assert.deepEqual(slots({ kind: 'stay_base', start: at(20, 15, 45), end: at(21, 7, 50) }), []);
assert.deepEqual(slots({ kind: 'stay_external', start: at(23, 1, 20), end: at(24, 5, 0) }), ['2026-07-23:lunch', '2026-07-23:dinner']);
assert.deepEqual(slots({ kind: 'stay_external', start: at(23, 10, 0), end: at(24, 0, 54) }), ['2026-07-23:lunch', '2026-07-23:dinner', '2026-07-24:supper']);
assert.deepEqual(slots({ kind: 'flight', start: at(20, 23, 10), end: at(21, 6, 20), enginesOff: at(21, 6, 20), destinationAtContractualBase: true }), ['2026-07-21:breakfast', '2026-07-21:supper']);
assert.deepEqual(slots({ kind: 'standby', start: at(20, 5, 30), end: at(20, 12, 30), activated: false }), []);

assert.deepEqual(normalizeInfobipVoice('pt-BR-Female-1'), { name: 'pt-BR-Female-1' });
assert.deepEqual(normalizeInfobipVoice('{"name":"pt-BR-Female-1","gender":"female"}'), { name: 'pt-BR-Female-1', gender: 'female' });
const request = buildInfobipTtsRequest({
  environment: {
    INFOBIP_API_KEY: 'test-key',
    INFOBIP_BASE_URL: 'crewcheck.api.infobip.com',
    INFOBIP_PHONE_FROM: '556133334444',
    INFOBIP_VOICE_NAME: 'pt-BR-Female-1',
  },
  phone: '5561999990000',
  text: 'Teste CrewCheck',
});
assert.equal(request.ok, true);
assert.deepEqual(request.body.messages[0].voice, { name: 'pt-BR-Female-1' });

const canonical = read('client/src/lib/canonicalRoster.ts');
const home = read('client/src/pages/Home.tsx');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const css = read('client/src/components/v1399/premium.css');
const server = read('server.mjs');
assert.match(canonical, /continuityStart/);
assert.match(canonical, /hasExactContinuity/);
assert.match(canonical, /forwardContinuationLimit/);
assert.match(home, /destinationAtContractualBase/);
assert.doesNotMatch(home, /cz-shortcuts cz-shortcuts-full/);
assert.doesNotMatch(home, /Academia\/restaurante\/mercado\/farmácia\/lavanderia em/);
assert.match(home, /AdminSystemHealthDashboard/);
assert.match(home, /admin \? fetch\('\/api\/telegram\/diagnostic'/);
assert.match(roster, /selectedMonth/);
assert.match(roster, /data-roster-iso/);
assert.match(roster, /> Hoje</);
assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(server, /lastInfobipAttempt/);
assert.match(server, /voz padrão compatível/);

console.log('CrewCheck v13.9.9 monthly roster, contractual-base allowances, menu/Admin and Infobip regression: OK');
