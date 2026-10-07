import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparationFingerprint, prepareSourcesOnce } from './v139/preparation-cache.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-prepare-test-'));
try {
  fs.mkdirSync(path.join(root, 'server'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server.mjs'), 'raw routing fixture');
  let calls = 0;
  const prepare = async () => { calls++; fs.writeFileSync(path.join(root, 'server.mjs'), 'prepared routing fixture'); };
  assert.equal(await prepareSourcesOnce(prepare, root), true);
  const prepared = preparationFingerprint(root);
  assert.equal(await prepareSourcesOnce(prepare, root), false);
  assert.equal(calls, 1);
  assert.equal(preparationFingerprint(root), prepared);
  // Compilation may regenerate an artifact between npm run build and npm start.
  fs.mkdirSync(path.join(root, 'server/concierge/generated'), { recursive: true });
  fs.writeFileSync(path.join(root, 'server/concierge/generated/runtime.mjs'), 'compiled output');
  assert.equal(await prepareSourcesOnce(prepare, root), false);
  fs.writeFileSync(path.join(root, 'scripts/changed-patch.mjs'), 'new patch');
  assert.equal(await prepareSourcesOnce(prepare, root), true);
  assert.equal(calls, 2);
  fs.writeFileSync(path.join(root, 'server.mjs'), 'changed security routing');
  await assert.rejects(prepareSourcesOnce(async () => { throw new Error('intentional preparation failure'); }, root), /intentional preparation failure/);
  assert.equal(fs.existsSync(path.join(root, '.crewcheck-source-preparation.json')), false);
  assert.equal(await prepareSourcesOnce(prepare, root), true);
  assert.equal(calls, 3);
  fs.writeFileSync(path.join(root, '.crewcheck-source-preparation.json'), '{broken');
  assert.equal(await prepareSourcesOnce(prepare, root), true);
  console.log('PASS: repeated preparation, compiled-output exclusion, source/patch invalidation, corrupt stamp and failed preparation never cached');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
