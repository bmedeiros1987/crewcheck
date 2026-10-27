import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const serverPath = 'server/v14316/controlCenter.mjs', adminPath = 'client/src/components/v14316/AdminControlCenter.tsx';
function verify(read) {
  const server = read(serverPath), admin = read(adminPath), card = read('client/src/components/PublishedSequenceCard.tsx');
  assert.match(server, /import \{ handleEscalaContact \} from '\.\.\/escala-contact\.mjs';/);
  assert.match(server, /export async function handleV14316ControlRoute\(req, res, url\) \{\s+if \(await handleEscalaContact\(req, res, url\)\) return true;/);
  assert.equal((admin.match(/<EscalaContactAdmin\/>/g) || []).length, 1);
  assert.match(admin, /import \{ EscalaContactAdmin \} from '@\/components\/EscalaContact';/);
  assert.equal((card.match(/<EscalaContactButton\/>/g) || []).length, 1);
  assert.match(card, /import \{ EscalaContactButton \} from '\.\/EscalaContact';/);
  const home = read('client/src/pages/Home.tsx');
  assert.match(home, /import \{ EscalaContactButton \} from '@\/components\/EscalaContact';/);
  assert.equal((home.match(/<EscalaContactButton\/>/g) || []).length, 1);
  assert.match(home, /<div className="cc-concierge-heading"><h1>Concierge<\/h1><EscalaContactButton\/><\/div>/);
  const implementation = read('server/escala-contact.mjs');
  assert.doesNotMatch(implementation, /CREATE TABLE|ALTER TABLE|ensureTables\(|ensureProfile\(|conciergeDbGet\(|conciergeDbPut\(/);
  assert.match(implementation, /identify = requireExistingIdentity/);
  assert.doesNotMatch(read('client/src/components/EscalaContact.tsx'), /Infobip|ACTION_CALL|\/api\/alarm|localStorage\.setItem|dutyDebrief|departureTime|activationConfirmed/);
}
const read = path => fs.readFileSync(path, 'utf8');
verify(read);
// Execute the actual preparer that rewrites both integration modules, in an
// in-memory filesystem. This is narrow generator proof, not full preparation.
const files = new Map([serverPath, adminPath].map(path => [path, read(path)]));
const fixtureFs = { existsSync: path => files.has(path), readFileSync: path => { assert(files.has(path)); return files.get(path); }, writeFileSync: (path, value) => { assert(files.has(path)); files.set(path, value); } };
const hardening = read('scripts/v14318/hardening.mjs').replace("import fs from 'node:fs';", '');
vm.runInNewContext(hardening, { fs: fixtureFs, console: { log() {} } });
verify(path => files.has(path) ? files.get(path) : read(path));
vm.runInNewContext(hardening, { fs: fixtureFs, console: { log() {} } });
verify(path => files.has(path) ? files.get(path) : read(path));
if (process.argv.includes('--prepared')) {
  assert.match(read('server/v139/index.mjs'), /await handleV14316ControlRoute\(req, res, url\)/);
  const home = read('client/src/pages/Home.tsx');
  assert.match(home, /<AdminControlCenter\/>/);
  assert.equal((home.match(/<PublishedSequenceCard events=/g) || []).length, 2);
}
console.log('PASS Escala integration modules and actual narrow hardening replay; no DDL, settings registry, calls or roster mutation' + (process.argv.includes('--prepared') ? '; canonical prepared route and both Home mounts present.' : '. Full canonical preparation remains a separate CI gate.'));
