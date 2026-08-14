import fs from 'node:fs';

const RELEASE_PATH = 'client/public/release.json';
const SW_PATH = 'client/public/sw.js';

function readRequired(path) {
  if (!fs.existsSync(path)) throw new Error(`[sw-sync] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

// The service worker's precache is keyed by CACHE_NAME/RUNTIME_CACHE. Browsers only
// re-fetch and re-install a service worker when its file bytes change - if these
// constants stop being bumped, every deploy after that point ships byte-identical
// sw.js content, so navigator.serviceWorker never detects an update and returning
// visitors stay pinned to whatever shell was precached the last time the file
// actually changed. That happened here: this pattern stopped being applied to sw.js
// around v14.3.55 while the app kept shipping releases past v14.3.82 - confirmed live
// by fetching the deployed bundle, which does contain current-main code, while the
// deployed sw.js (and every returning client controlled by it) was still keyed to
// v14.3.55 and never re-installed. installPwaUpdateCoordinator (client/src/lib/
// pwaUpdateCoordinator.ts, wired in App.tsx) already handles activating a waiting
// worker without interrupting an active session - it had nothing to activate because
// no new worker was ever detected. This keeps the cache key in lockstep with the
// same canonical release.json version already used by sync-canonical-manual.mjs, so
// no future release can silently stop bumping it again.
export function syncServiceWorkerVersion(source, version) {
  const normalized = String(version || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(normalized)) throw new Error(`[sw-sync] Versão canônica inválida: ${normalized || '(vazia)'}`);

  let patched = source;
  const replacements = [
    [/(const CACHE_NAME = 'crewcheck-v)[0-9.]+(-shell';)/, `$1${normalized}$2`],
    [/(const RUNTIME_CACHE = 'crewcheck-v)[0-9.]+(-runtime';)/, `$1${normalized}$2`],
  ];

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(patched)) throw new Error(`[sw-sync] Marcador canônico ausente em ${SW_PATH}: ${pattern}`);
    patched = patched.replace(pattern, replacement);
  }

  return patched;
}

if (process.env.CREWCHECK_SW_SYNC_SKIP_APPLY !== '1') {
  const release = JSON.parse(readRequired(RELEASE_PATH));
  const version = String(release?.version || '').trim();
  const before = readRequired(SW_PATH);
  const after = syncServiceWorkerVersion(before, version);
  if (after !== before) fs.writeFileSync(SW_PATH, after, 'utf8');
  console.log(`[sw-sync] Service worker alinhado à release canônica ${version}.`);
}
