import assert from 'node:assert/strict';
import { hasReleaseWatcher, replaceReleaseWatchers } from './lib/release-watcher.mjs';

const watcherV14329 = `<script id="crewcheck-release-watch-v14329">
  fetch('/release.json?ts=' + Date.now());
</script>`;
const watcherV14343 = `<script id="crewcheck-release-watch-v14343">
  fetch('/release.json?ts=' + Date.now());
</script>`;

let html = `<html><body>${watcherV14329}${watcherV14343}${watcherV14329}</body></html>`;
assert.equal(hasReleaseWatcher(html), true, 'watcher existente não foi reconhecido');

html = replaceReleaseWatchers(html, watcherV14343);
html = replaceReleaseWatchers(html, watcherV14343);
html = replaceReleaseWatchers(html, watcherV14343);

assert.equal(
  (html.match(/id="crewcheck-release-watch-v/g) || []).length,
  1,
  'deve restar exatamente um watcher',
);
assert.equal(
  (html.match(/fetch\('\/release\.json\?ts='/g) || []).length,
  1,
  'deve restar exatamente uma consulta a release.json',
);
assert.equal(hasReleaseWatcher('<html><body></body></html>'), false);

console.log('[release-watcher] idempotência validada.');
