import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const chain = read('scripts/v139/apply.mjs');
const applySource = read('scripts/v14394/apply.mjs');
const cssSource = read('client/src/styles/ipad-shell-v14-3-94.css');
const mainSource = read('client/src/main.tsx');

assert.ok(chain.includes("await import('../v14394/apply.mjs');"), 'v14.3.94 deve participar da preparação canônica');
assert.ok(chain.indexOf("await import('../v14394/apply.mjs');") > chain.indexOf("await import('../v14393/apply.mjs');"), 'v14.3.94 deve ser o último hardening visual após v14.3.93');
assert.ok(mainSource.includes('import "./styles/ipad-shell-v14-3-94.css";'), 'CSS final do iPad deve ser carregado por último no shell');

const prepared = spawnSync(process.execPath, [path.join(root, 'scripts/v139/apply.mjs')], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env },
});
assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout || 'preparação canônica falhou');

const home = read('client/src/pages/Home.tsx');
assert.ok(home.includes('data-ipad-layout-v14394="contained"'), 'raiz deve carregar marcador de contenção do iPad');
assert.ok(home.includes("data-menu-open={drawer ? 'true' : 'false'}"), 'raiz deve expor estado explícito do menu');

for (const marker of [
  '.cz-app[data-ipad-layout-v14394="contained"]',
  '.cz-app[data-menu-open="true"] > .cz-global-header',
  '.cz-menu-overlay',
  '.cz-menu-panel',
  '.cz-menu-header-actions',
  '.cz-menu-logout span',
  'white-space: nowrap !important;',
  'writing-mode: horizontal-tb !important;',
  '@media (min-width: 700px) and (max-width: 1600px)',
  '@media (pointer: coarse) and (min-width: 700px)',
  'width: 100vw !important;',
  'max-width: none !important;',
  'grid-template-columns: repeat(2, minmax(0, 1fr)) !important;',
  '.cc-sidebar',
  'width: 220px !important;',
]) assert.ok(cssSource.includes(marker), `contrato visual ausente: ${marker}`);

assert.ok(!cssSource.includes('word-break: break-all'), 'texto do menu não pode quebrar letra por letra');
assert.ok(cssSource.indexOf('.cz-app[data-menu-open="true"] > .cz-global-header') >= 0, 'header precisa de fallback sem :has()');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'server/rosterParser.mjs',
]) {
  assert.ok(!applySource.includes(protectedPath), `hardening do iPad não pode alterar ${protectedPath}`);
}

const afterFirst = {
  home: read('client/src/pages/Home.tsx'),
  main: read('client/src/main.tsx'),
};
const reapplied = spawnSync(process.execPath, [path.join(root, 'scripts/v14394/apply.mjs')], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env },
});
assert.equal(reapplied.status, 0, reapplied.stderr || reapplied.stdout || 'reaplicação v14.3.94 falhou');
assert.equal(read('client/src/pages/Home.tsx'), afterFirst.home, 'v14.3.94 deve ser idempotente em Home.tsx');
assert.equal(read('client/src/main.tsx'), afterFirst.main, 'v14.3.94 deve ser idempotente em main.tsx');

console.log('v14.3.94 iPad/menu P0 regression passed: viewport contained, drawer full-screen on coarse tablets, logout horizontal, explicit header suppression and protected engines untouched.');
