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

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const menuStart = home.indexOf('function MenuDrawer(');
const menuEnd = home.indexOf('\nfunction ', menuStart + 'function MenuDrawer('.length);
assert.ok(menuStart >= 0 && menuEnd > menuStart, 'prepared MenuDrawer missing');
const preparedMenu = home.slice(menuStart, menuEnd);

for (const route of [
  'cockpit', 'roster', 'compare', 'departure', 'wakeup', 'weather', 'presentation', 'mycar',
  'radar', 'alerts', 'regulation', 'load', 'emergency', 'import', 'iflight', 'bids', 'map', 'database', 'crewlocker',
  'perdiem', 'salary', 'crew', 'concierge', 'hotels', 'gyms', 'routine', 'community', 'life',
  'reports', 'calendar', 'exports', 'plans', 'settings', 'manual', 'guardian', 'support', 'crewlock',
  'updates', 'maintenance', 'admin',
]) assert.match(preparedMenu, new RegExp(`\\['${route}',`), `menu index must keep ${route} discoverable`);

assert.match(preparedMenu, /const groups: Array/);
assert.match(preparedMenu, /CrewCheckMark className="cz-menu-brandmark"/);
assert.match(preparedMenu, /Buscar função/);
assert.match(preparedMenu, />Fixados e mais usados</);
assert.match(preparedMenu, /aria-pressed=\{favorite\}/);
assert.match(preparedMenu, /Editar favoritos/);
assert.match(preparedMenu, /catalogGroups\.map/, 'catalog must render the favorites-excluded groups');
assert.match(preparedMenu, /\{editingFavorites && <button type="button" className="cc-menu-favorite"/, 'stars only render in edit mode');
assert.match(preparedMenu, /menuQuery\s*\?\s*filteredGroups/, 'search must list every destination once');
assert.match(preparedMenu, /!visibleShortcutIds\.includes\(viewId\)/, 'catalog must not repeat fixed or frequently used shortcuts');
assert.doesNotMatch(preparedMenu, /\{filteredGroups\.map/, 'catalog must not bypass the favorites exclusion');
assert.match(preparedMenu, /storedUser\?\.id \|\| null/);
assert.match(preparedMenu, /data-menu-label=\{label\}/);
assert.match(preparedMenu, /data-menu-group=\{group\.title\}/);
assert.doesNotMatch(preparedMenu, /parsePDF|analyzeCompliance|financialRules/, 'Menu must not duplicate domain engines');

const homeImports = home.slice(0, menuStart);
assert.match(homeImports, /menuEntryMatches/);
assert.match(homeImports, /menu-5s\.css/);

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

console.log('PASS: canonical grouped Menu gained account favorites and search without losing routes, brand or 5S ownership');
