import assert from 'node:assert/strict';
import fs from 'node:fs';

const render = fs.readFileSync('render.yaml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(render, /buildCommand:\s*npm ci && npm run build/, 'Render must prepare/build through npm run build');
assert.match(
  render,
  /startCommand:\s*node --import \.\/server\/telegram-fast-ack\.mjs server\.mjs/,
  'Render runtime must start the already-built server directly without replaying v139',
);
assert.doesNotMatch(render, /startCommand:\s*npm start/, 'Render must not invoke npm start after a build that already ran v139');
assert.match(String(pkg.scripts?.build || ''), /scripts\/v139\/apply\.mjs/, 'build remains the canonical preparation boundary');
assert.match(String(pkg.scripts?.start || ''), /scripts\/v139\/apply\.mjs/, 'npm start remains safe for fresh non-Render workspaces');

console.log('[p2-659-render-build-start-handoff] PASS — Render build prepares once and runtime does not replay v139.');
