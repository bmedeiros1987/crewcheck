import assert from 'node:assert/strict';
import fs from 'node:fs';

const apply = fs.readFileSync('scripts/v14343/apply.mjs', 'utf8');
const coordinator = fs.readFileSync('client/src/lib/pwaUpdateCoordinator.ts', 'utf8');
const index = fs.readFileSync('client/index.html', 'utf8');

const start = apply.indexOf('const releaseWatcher =');
const end = apply.indexOf("update('client/index.html'", start);
assert.ok(start >= 0 && end > start, 'release watcher source must remain inspectable');
const watcher = apply.slice(start, end);

assert.ok(
  watcher.includes("if (checking || navigator.onLine === false) return;"),
  'release watcher must skip update checks while offline',
);
assert.ok(!watcher.includes('window.location.reload()'), 'release watcher must not force reload');
assert.ok(!watcher.includes("registration.waiting.postMessage('SKIP_WAITING')"), 'release watcher must not force activation');
assert.ok(!index.includes('window.location.reload()'), 'materialized PWA HTML must not force reload');
assert.ok(!index.includes("registration.waiting.postMessage('SKIP_WAITING')"), 'materialized PWA HTML must not force activation');
assert.ok(coordinator.includes("document.visibilityState === 'hidden'"), 'safe activation must retain hidden-state gate');
assert.ok(coordinator.includes('Date.now() - lastActivityAt >= idleMs'), 'safe activation must retain idle gate');
assert.ok(!coordinator.includes('window.location.reload'), 'coordinator must remain reload-free');

console.log('[mobile-pwa-safe-update] OK');
