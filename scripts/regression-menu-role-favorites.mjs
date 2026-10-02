import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

// Execute the prepared MenuDrawer's real selection/save closure; no copied runtime.
// Synthetic account/menu groups only; this does not replace browser/device acceptance.
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const drawer = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'MenuDrawer');
const allowed = source.statements.find((node) => ts.isVariableStatement(node)
  && node.declarationList.declarations.some((entry) => entry.name.getText(source) === 'MENU_5S_ALLOWED_IDS'));
assert.ok(drawer?.body && allowed, 'Prepared MenuDrawer and canonical menu-ID selector are required');
const text = drawer.getText(source);
const start = text.indexOf('  const allMenuItems =');
const end = text.indexOf('  const jump =', start);
assert.ok(start >= 0 && end > start, 'Exact prepared favorites closure must exist');
const compile = (value) => ts.transpileModule(value, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const preference = await import(`data:text/javascript;base64,${Buffer.from(compile(
  fs.readFileSync('client/src/lib/menuPreference.ts', 'utf8'),
)).toString('base64')}`);
const closure = compile(allowed.getText(source) + '\n' + text.slice(start, end)
  + '\nthis.result = { menuFavorites, favoriteItems, catalogGroups, toggleMenuFavorite };');
const plain = (value) => JSON.parse(JSON.stringify(value));
const entry = (id) => [id, id, '', null];
const regularIds = ['roster', 'radar', 'departure', 'hotels', 'settings', 'cockpit'];
const adminIds = ['updates', 'maintenance', 'admin'];
const values = new Map();
let writes = 0;
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { writes++; values.set(key, String(value)); },
  removeItem: (key) => values.delete(key),
};
const seed = (account, ids) => values.set(preference.menuFavoritesKey(account), JSON.stringify(ids));
function render({ accountId = 'A', admin = false, query = '', store = storage } = {}) {
  const groups = [{ title: 'Hoje', items: regularIds.map(entry) }];
  if (admin) groups.push({ title: 'Administração', items: adminIds.map(entry) });
  const scope = {
    ...preference, groups, accountId, menuQuery: query,
    // Baseline state reproduces the old bug; corrected code reads current groups instead.
    menuFavorites: preference.readMenuFavorites(store, accountId, [...regularIds, ...adminIds]),
    window: { localStorage: store }, document: { activeElement: null }, HTMLElement: class {},
    pendingFavoriteFocus: { current: null }, status: '', revision: 0,
    setMenuStatus: (value) => { scope.status = value; },
    setMenuFavorites: () => {},
    bumpMenuFavoritesRevision: (update) => { scope.revision = update(scope.revision); },
  };
  vm.runInNewContext(closure, scope, { timeout: 1000 });
  return scope;
}

seed('A', ['admin', 'updates', 'maintenance', 'roster', 'radar']);
seed('B', ['hotels']);
const untouchedB = values.get(preference.menuFavoritesKey('B'));
assert.deepEqual(plain(render({ admin: true }).result.menuFavorites), ['admin', 'updates', 'maintenance', 'roster', 'radar']);
const revoked = render();
assert.deepEqual(plain(revoked.result.menuFavorites), ['roster', 'radar'], 'hidden admin IDs must not occupy favorite slots');
assert.equal(writes, 0, 'render/profile change must not mutate saved preferences');
for (const id of ['departure', 'hotels', 'settings']) {
  const current = render();
  current.result.toggleMenuFavorite(id);
  assert.equal(current.status, 'Favorito adicionado.');
  assert.equal(current.revision, 1, 'successful save must schedule a fresh read/render');
}
assert.deepEqual(plain(render().result.menuFavorites), ['roster', 'radar', 'departure', 'hotels', 'settings']);
assert.equal(values.get(preference.menuFavoritesKey('B')), untouchedB, 'account B must remain untouched');
const full = render();
const beforeLimit = writes;
full.result.toggleMenuFavorite('cockpit');
assert.match(full.status, /até 5 favoritos/);
assert.equal(writes, beforeLimit, 'sixth favorite must not be saved');
const forbidden = render();
forbidden.result.toggleMenuFavorite('admin');
assert.equal(writes, beforeLimit, 'a destination absent from current groups must not be saved');
const removed = render();
removed.result.toggleMenuFavorite('roster');
assert.equal(removed.status, 'Favorito removido.');
assert.equal(render().result.menuFavorites.length, 4);
assert.deepEqual(plain(render({ accountId: 'B' }).result.menuFavorites), ['hotels'], 'account switch must read its own favorites immediately');
const search = render({ query: 'admin' });
assert.equal(search.result.catalogGroups.length, 0, 'search cannot restore hidden administrative destinations');
const anon = render({ accountId: null });
assert.deepEqual(plain(anon.result.menuFavorites), []);
const beforeAnon = writes;
anon.result.toggleMenuFavorite('radar');
assert.equal(writes, beforeAnon);
assert.match(anon.status, /Entre na sua conta/);
values.set(preference.menuFavoritesKey('C'), '{invalid');
assert.deepEqual(plain(render({ accountId: 'C' }).result.menuFavorites), ['roster', 'radar', 'departure']);
const unavailable = render({ store: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} } });
unavailable.result.toggleMenuFavorite('hotels');
assert.match(unavailable.status, /Não foi possível salvar/);
assert.equal(unavailable.revision, 0, 'failed persistence must not signal successful update');

// The source, not only helper fixtures, must derive visibility before reading/saving.
assert.match(allowed.getText(source), /groups\.flatMap/, 'no second static role/route allowlist');
assert.match(text, /readMenuFavorites\(window\.localStorage, accountId, menuAllowedIds\)/);
assert.match(text, /saveMenuFavorites\(window\.localStorage, accountId, menuAllowedIds, next\)/);
assert.doesNotMatch(text, /setMenuFavorites|\[open, menuFavorites,/, 'no stale cross-role/account favorites state');
const earlyReturn = text.indexOf('if (!open) return null;');
assert.ok(earlyReturn > 0);
assert.doesNotMatch(text.slice(earlyReturn), /\buse(?:State|Effect|Ref|Memo|Callback)\s*\(/, 'closed/open renders must preserve hook order');
execFileSync(process.execPath, ['scripts/p1-menu-5s/apply.mjs'], { stdio: 'pipe' });
assert.equal(fs.readFileSync('client/src/pages/Home.tsx', 'utf8'), home, 'reapplying the finalizer must preserve the prepared source byte for byte');
console.log('PASS: real prepared favorites closure preserves role visibility, five usable slots, account isolation, no implicit writes and failure feedback');
