import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('client/src/lib/menuPreference.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022 },
}).outputText;
const menu = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const allowed = ['cockpit', 'roster', 'radar', 'departure', 'settings', 'hotels'];

assert.deepEqual(menu.readMenuFavorites(storage, 'A', allowed), ['roster', 'radar', 'departure']);
assert.equal(menu.saveMenuFavorites(storage, 'A', allowed, ['settings', 'hotels']), true);
assert.deepEqual(menu.readMenuFavorites(storage, 'A', allowed), ['settings', 'hotels']);
assert.deepEqual(menu.readMenuFavorites(storage, 'B', allowed), ['roster', 'radar', 'departure'], 'account B must not inherit account A');
assert.deepEqual(menu.readMenuFavorites(storage, null, allowed), [], 'anonymous menu must not expose private favorites');
assert.equal(menu.saveMenuFavorites(storage, null, allowed, ['settings']), false, 'anonymous menu must not persist favorites');
assert.deepEqual(menu.normalizeMenuFavorites(['radar', 'invalid', 'radar', 'roster'], allowed, []), ['radar', 'roster']);
assert.equal(menu.normalizeMenuFavorites(['cockpit', 'roster', 'radar', 'departure', 'settings', 'hotels'], allowed, []).length, 5);
assert.equal(menu.menuEntryMatches('meteorologia', 'Meteorologia', 'METAR e TAF', 'Operação'), true);
assert.equal(menu.menuEntryMatches('operacao', 'Radar', 'Portão e status', 'Operação'), true, 'search must ignore accents');
assert.equal(menu.resetMenuFavorites(storage, 'A'), true);
assert.deepEqual(menu.readMenuFavorites(storage, 'A', allowed), ['roster', 'radar', 'departure']);

const component = fs.readFileSync('client/src/components/v1391/MenuDrawer5S.tsx', 'utf8');
for (const id of [
  'cockpit', 'roster', 'alerts', 'departure', 'settings', 'maintenance', 'import', 'features',
  'radar', 'weather', 'perdiem', 'salary', 'reports', 'calendar', 'exports', 'routine',
  'database', 'crew', 'load', 'wakeup', 'hotels', 'presentation', 'map', 'mycar', 'gyms',
  'iflight', 'updates', 'concierge', 'plans', 'community', 'compare', 'regulation', 'bids', 'admin',
]) assert.match(component, new RegExp(`id: '${id}'`), `menu index must keep ${id} discoverable`);
assert.match(component, /Índice completo/);
assert.match(component, /Favoritos/);
assert.match(component, /Buscar função/);
assert.match(component, /aria-pressed=\{favorite\}/);
assert.match(component, /storedUser\?\.id \|\| null/);
assert.match(component, /group: 'Pernoite'/);
assert.match(component, /group: 'Financeiro'/);
assert.doesNotMatch(component, /parsePDF|analyzeCompliance|financialRules/, 'Menu must not duplicate domain engines');

const preparedHome = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(preparedHome, /import \{ MenuDrawer5S \}/);
assert.match(preparedHome, /return <MenuDrawer5S/);
assert.doesNotMatch(preparedHome, /const nav: Array<\[ZeroView/, 'legacy ungrouped menu must be replaced');

const css = fs.readFileSync('client/src/components/v1391/menu-5s.css', 'utf8');
assert.match(css, /min-height: 44px/);
assert.match(css, /min-width: 0/);
assert.match(css, /prefers-reduced-motion: reduce/);

const inventory = JSON.parse(fs.readFileSync('config/navigation-surface-inventory.json', 'utf8'));
assert.equal(inventory.policy.noRemovalByClassification, true);
for (const id of ['wakeup', 'concierge', 'hotels']) {
  assert.equal(inventory.surfaces.find((surface) => surface.id === id)?.owner, 'pernoite');
}
for (const id of ['salary', 'perdiem', 'crew']) {
  assert.equal(inventory.surfaces.find((surface) => surface.id === id)?.owner, 'financeiro');
}

console.log('PASS: Menu 5S keeps the complete index, account-scoped favorites, search, 44px targets and 5S domain ownership');
