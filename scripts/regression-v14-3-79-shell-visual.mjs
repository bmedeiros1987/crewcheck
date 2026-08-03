import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const run = spawnSync(process.execPath, ['scripts/v139/apply.mjs'], { encoding: 'utf8' });
assert.equal(run.status, 0, run.stderr || run.stdout || 'preparação canônica falhou');

const drawer = fs.readFileSync('client/src/components/premium/SideDrawer.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/premium/shell-premium.css', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.ok(drawer.includes("import './shell-premium.css';"), 'SideDrawer deve importar o CSS premium do shell');
assert.ok(drawer.includes('cc-shell-premium'), 'drawer/sidebar devem usar shell premium');
assert.ok(drawer.includes('cc-drawer-header-actions'), 'mobile deve ter ações rápidas no cabeçalho');
assert.ok(drawer.includes('aria-label="Encerrar sessão"'), 'logout deve ter nome acessível');
assert.ok(drawer.includes('cc-profile-card'), 'perfil deve ter card dedicado');
assert.ok(drawer.includes('cc-logout-button'), 'logout deve usar estilo dedicado');
assert.match(css, /\.cc-shell-premium \.cc-header-action\.logout/, 'atalho de logout deve ter estilo próprio');
assert.match(css, /@media \(max-width:\s*640px\)/, 'shell deve ter contrato mobile');
assert.ok(chain.trimEnd().endsWith("await import('../v14379/apply.mjs');"), 'v14.3.79 deve encerrar a preparação canônica');

console.log('[v14.3.79-shell-visual] OK — cabeçalho, perfil e logout acessíveis em Web/PWA/APK.');
