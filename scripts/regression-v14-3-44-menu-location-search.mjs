import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const paths = {
  home: 'client/src/pages/Home.tsx',
  app: 'client/src/App.tsx',
  index: 'client/index.html',
  css: 'client/src/index.css',
  release: 'client/public/release.json',
};
const before = Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, read(value)]));
const chain = read('scripts/v139/apply.mjs');
const applySource = read('scripts/v14344/apply.mjs');
const cssSource = read('scripts/v14344/web-menu.css');
const workflow = read('.github/workflows/crewcheck-v13-8-validation.yml');

assert.ok(chain.trimEnd().endsWith("await import('../v14344/apply.mjs');"), 'v14.3.44 deve encerrar a preparação canônica');
assert.ok(before.home.includes("const DEFAULT_VERSION = '14.3.44';"), 'Home deve anunciar v14.3.44');
assert.ok(before.home.includes('data-layout-v14344="web-icon-menu"'), 'shell deve identificar o menu Web icon-first');

const menuStart = before.home.indexOf('function MenuDrawer(');
const menuEnd = before.home.indexOf('function Cockpit(', menuStart);
const menu = before.home.slice(menuStart, menuEnd);
assert.ok(menuStart >= 0 && menuEnd > menuStart, 'MenuDrawer não localizado');
assert.ok(!menu.includes('<CrewLocationAccess compact/>'), 'localização não pode ocupar o topo do menu');
assert.ok(menu.includes('data-menu-label={label}'), 'botões do menu devem expor o rótulo ao hover');
assert.ok(menu.includes('data-menu-description={desc}'), 'botões do menu devem expor a descrição ao hover');
assert.ok(menu.includes('aria-label={label}'), 'botões somente com ícone devem manter nome acessível');
assert.ok(menu.includes('<Icon aria-hidden="true"/>'), 'ícone do menu deve ser decorativo e centralizável');

const settingsStart = before.home.indexOf('function SettingsView(');
const settingsEnd = before.home.indexOf('function FeatureHub(', settingsStart);
const settings = before.home.slice(settingsStart, settingsEnd);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, 'SettingsView não localizado');
assert.ok(settings.includes('className="cc-location-settings"'), 'localização deve ficar em Configurações');
assert.ok(settings.includes('<CrewLocationAccess/>'), 'Configurações deve renderizar o controle explícito de localização');

const searchStart = before.home.indexOf('className="cz-place-query-row"');
const searchEnd = before.home.indexOf('</div>', searchStart);
const searchField = before.home.slice(searchStart, searchEnd);
assert.ok(searchStart >= 0, 'campo de pesquisa de locais não localizado');
assert.ok(searchField.includes('className="cc-search-field"'), 'campo de pesquisa deve usar o invólucro padronizado');
assert.ok(searchField.includes('className="cc-search-icon-end"'), 'lupa deve ficar no fim do campo');
assert.ok(searchField.indexOf('<input') < searchField.indexOf('<Search className="cc-search-icon-end"'), 'input deve aparecer antes da lupa');
assert.ok(!before.home.includes('<label><Search/><input'), 'lupa não pode reaparecer antes do texto');

for (const marker of [
  '@media (hover: hover) and (pointer: fine) and (min-width: 1024px)',
  'grid-template-columns: repeat(auto-fill, 72px)',
  'place-items: center',
  '> button > svg:last-child',
  '> button:hover > span',
  '.cc-location-settings',
  '.cc-search-icon-end',
  'padding-right: 46px',
]) assert.ok(cssSource.includes(marker), `proteção visual v14.3.44 ausente: ${marker}`);
assert.ok(before.css.includes('CrewCheck v14.3.44 — menu Web icon-first'), 'CSS v14.3.44 deve estar aplicado uma única vez');
assert.equal((before.css.match(/CrewCheck v14\.3\.44 — menu Web icon-first/g) || []).length, 1, 'CSS v14.3.44 não pode duplicar');

assert.ok(!/^(?:<<<<<<<|=======|>>>>>>>)/m.test(workflow), 'workflow não pode conter marcadores de conflito Git');
assert.ok(workflow.includes('Validate menu icons, Settings location and end-positioned search'), 'workflow deve executar a regressão v14.3.44');
assert.ok(workflow.includes('menu-location-search-regression.log'), 'diagnóstico v14.3.44 deve ser publicado em caso de falha');
assert.ok(before.release.includes('14.3.44'), 'release.json deve anunciar v14.3.44');

for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/financialRules.ts']) {
  assert.ok(!applySource.includes(`update('${protectedPath}'`), `patch visual não pode alterar motor protegido: ${protectedPath}`);
}

const apply = spawnSync(process.execPath, [path.join(root, 'scripts/v14344/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(apply.status, 0, apply.stderr || apply.stdout || 'segunda aplicação v14.3.44 falhou');
for (const [key, relative] of Object.entries(paths)) {
  assert.equal(read(relative), before[key], `patch v14.3.44 deve ser idempotente em ${relative}`);
}

console.log('v14.3.44 menu usability: location in Settings, icon-only desktop menu with hover details, centered icons, end-positioned search icon, clean workflow and protected engines validated.');
