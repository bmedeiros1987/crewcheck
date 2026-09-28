import assert from 'node:assert/strict';
import fs from 'node:fs';

// Root cause (confirmed live against the deployed site): client/public/sw.js's cache
// name stopped being version-bumped around v14.3.55, while the app kept shipping past
// v14.3.82. Browsers only re-install a service worker when its file bytes change, so
// every deploy after that point served a byte-identical sw.js - navigator.serviceWorker
// never detected an update, and installPwaUpdateCoordinator (client/src/lib/
// pwaUpdateCoordinator.ts, wired in App.tsx) had nothing to activate. Returning visitors
// stayed pinned to whatever app shell was precached the last time sw.js actually
// changed, indefinitely - confirmed by a user report showing a pre-#465/#468 drawer
// (English "Sign" label, no such string anywhere in current client/src) that survived a
// hard refresh, which cannot bypass an already-installed, non-updating service worker.
process.env.CREWCHECK_SW_SYNC_SKIP_APPLY = '1';
const { syncServiceWorkerVersion } = await import('./ci/sync-service-worker-version.mjs');

const fixture = `const CACHE_NAME = 'crewcheck-v14.3.55-shell';
const RUNTIME_CACHE = 'crewcheck-v14.3.55-runtime';
const APP_SHELL = ['/', '/index.html'];
`;

const once = syncServiceWorkerVersion(fixture, '14.3.82');
assert.match(once, /const CACHE_NAME = 'crewcheck-v14\.3\.82-shell';/, 'CACHE_NAME must track the current release version');
assert.match(once, /const RUNTIME_CACHE = 'crewcheck-v14\.3\.82-runtime';/, 'RUNTIME_CACHE must track the current release version');

const twice = syncServiceWorkerVersion(once, '14.3.82');
assert.equal(once, twice, 'sync must be idempotent - re-running with the same version must not change the file again');

assert.throws(() => syncServiceWorkerVersion(fixture, ''), /Versão canônica inválida/, 'must fail closed on a missing/invalid version rather than silently writing a broken cache key');
assert.throws(() => syncServiceWorkerVersion('const CACHE_NAME = 1;', '14.3.82'), /Marcador canônico ausente/, 'must fail loudly if the sw.js anchor is ever restructured, not silently no-op');

// This is the actual chain entry point (scripts/v139/apply.mjs) - guards against the
// exact failure mode that caused this: a step present in some historical version but
// silently dropped from the chain that every real build/dev/start command runs.
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
assert.ok(chain.includes("await import('../ci/sync-service-worker-version.mjs');"), 'sw version sync must run on every prepare - install/dev/build/start');

console.log('Service worker version sync regression: ok');
