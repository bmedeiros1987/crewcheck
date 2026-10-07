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
  fs.writeFileSync(path.join(root, '.tsbuildinfo'), 'TypeScript incremental compiler output');
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
  // Inputs outside the old whitelist: Render processing and required OAuth files.
  fs.writeFileSync(path.join(root, 'render.yaml'), 'AUTO_MIGRATE: false');
  const canonicalRender = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
  await prepareSourcesOnce(prepare, root);
  const beforeRender = calls;
  fs.writeFileSync(path.join(root, 'render.yaml'), 'AUTO_MIGRATE: true');
  assert.equal(await prepareSourcesOnce(prepare, root), true);
  assert.equal(calls, beforeRender + 1);
  fs.writeFileSync(path.join(root, 'render.yaml'), canonicalRender);
  assert.equal(await prepareSourcesOnce(prepare, root), true, 'restoring render.yaml must invalidate a changed certificate');
  for (const file of ['docs/google-oauth-verification-kit-2026.md', 'migrations/20260719_009_google_oauth_legal_utf8.sql', 'shared/fixture.ts', 'config/fixture.json', 'new-root-input.txt']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), 'required input');
    assert.equal(await prepareSourcesOnce(prepare, root), true, `${file}: adding input invalidates`);
    fs.rmSync(path.join(root, file));
    assert.equal(await prepareSourcesOnce(prepare, root), true, `${file}: removing input invalidates`);
  }
  // Partial contexts neither consume a cached success nor certify partial output.
  for (const flag of ['CREWCHECK_MANUAL_SYNC_SKIP_APPLY', 'CREWCHECK_V14356_SKIP_APPLY', 'CREWCHECK_V14380_SKIP_APPLY']) {
    const beforeSkip = calls;
    await prepareSourcesOnce(prepare, root, { env: { [flag]: '1' } });
    assert.equal(calls, beforeSkip + 1, `${flag}: must not reuse complete stamp`);
    assert.equal(fs.existsSync(path.join(root, '.crewcheck-source-preparation.json')), false, `${flag}: must not certify partial output`);
    assert.equal(await prepareSourcesOnce(prepare, root, { env: {} }), true, `${flag}: removing flag requires preparation`);
    assert.equal(await prepareSourcesOnce(prepare, root, { env: {} }), false);
  }
  let finalized = 0;
  const finalize = async () => { finalized++; fs.writeFileSync(path.join(root, 'manual.html'), 'canonical final output'); };
  await prepareSourcesOnce(prepare, root, { finalize });
  assert.equal(await prepareSourcesOnce(prepare, root, { finalize }), false);
  assert.equal(finalized, 2, 'finalizer runs once on each invocation, including cache hits');
  await assert.rejects(prepareSourcesOnce(prepare, root, { finalize: async () => { throw new Error('finalization failure'); } }), /finalization failure/);
  assert.equal(fs.existsSync(path.join(root, '.crewcheck-source-preparation.json')), false);
  console.log('PASS: repeated preparation, compiled-output exclusion, source/patch invalidation, corrupt stamp, failed preparation/finalization, render/docs/migrations coverage, skip flags never cached and canonical finalization on cache hits');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
