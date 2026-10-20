import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.CREWCHECK_V14380_SKIP_APPLY = '1';
const { patchRosterCacheIntegrityV14380 } = await import('./v14380/apply.mjs');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.equal(patchRosterCacheIntegrityV14380(home), home, 'legacy cache preparation preserves the exact stricter account/intent loader');
const missingOwnerGuard = home.replace('payload.owner !== startupOwner() || ', '');
assert.notEqual(missingOwnerGuard, home);
assert.throws(() => patchRosterCacheIntegrityV14380(missingOwnerGuard), /leitura do cache/, 'an unrecognized weaker loader must fail closed rather than be silently accepted');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');
assert.ok(main.includes("import './styles/roster-startup.css';"), 'startup stylesheet is still loaded');
assert.ok(main.indexOf("import './styles/roster-startup.css';") < main.indexOf('import "./styles/ipad-header-recovery.css";'), 'startup CSS preserves the final header precedence');
assert.ok(main.trimEnd().endsWith('import "./styles/ipad-header-recovery.css";'));
console.log('PASS: exact stronger loader remains idempotent; weaker owner guard rejected; final header precedence retained.');
