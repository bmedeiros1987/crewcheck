import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Execute the actual prepared menu declarations, not a second implementation.
// Hooks are kept across renders; effects deliberately do not run between a role
// or account change and the assertion. Browser/focus acceptance remains separate.
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 };
const helper = ts.transpileModule(fs.readFileSync('client/src/lib/menuPreference.ts', 'utf8'), { compilerOptions: options }).outputText;
const preferences = await import(`data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`);
const text = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const drawer = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'MenuDrawer');
assert.ok(drawer?.body, 'prepared MenuDrawer must exist');
const vocabulary = source.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => item.name.getText(source) === 'MENU_5S_ALLOWED_IDS'));
assert.ok(vocabulary, 'canonical route vocabulary must exist');
const names = new Set(['menuFavorites', 'menuAllowedIds', 'menuFavoritesRevision',
  'allMenuItems', 'favoriteItems', 'filteredGroups', 'catalogGroups', 'toggleMenuFavorite']);
const declarations = drawer.body.statements.filter(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => {
    if (ts.isIdentifier(item.name)) return names.has(item.name.text);
    return ts.isArrayBindingPattern(item.name) && item.name.elements.some(element =>
      ts.isBindingElement(element) && ts.isIdentifier(element.name) && names.has(element.name.text));
  }));
const executable = ts.transpileModule(vocabulary.getText(source) + '\n'
  + declarations.map(node => node.getText(source)).join('\n')
  + '\nreturn { menuFavorites, favoriteItems, catalogGroups, toggleMenuFavorite };', { compilerOptions: options }).outputText;
const evaluate = new Function('window', 'accountId', 'groups', 'menuQuery', 'useState',
  'readMenuFavorites', 'saveMenuFavorites', 'menuEntryMatches', 'MENU_FAVORITES_LIMIT',
  'setMenuStatus', 'document', 'HTMLElement', 'pendingFavoriteFocus', executable);
const normal = ['roster', 'radar', 'departure', 'cockpit', 'settings', 'hotels'];
const privileged = ['updates', 'maintenance', 'admin'];
const groupsFor = admin => [{ title: 'Geral', items: normal.map(id => [id, id, id, null]) },
  ...(admin ? [{ title: 'Administração', items: privileged.map(id => [id, id, id, null]) }] : [])];
function harness() {
  const values = new Map();
  const states = [];
  let status = '';
  let denyWrites = false;
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if (denyWrites) throw new Error('storage unavailable'); values.set(key, value); },
    removeItem: key => values.delete(key),
  };
  const seed = (id, value) => localStorage.setItem(preferences.menuFavoritesKey(id), JSON.stringify(value));
  const persisted = id => JSON.parse(localStorage.getItem(preferences.menuFavoritesKey(id)) || 'null');
  const render = (id = 'A', admin = true, query = '', groups = groupsFor(admin)) => {
    let cursor = 0;
    const useState = initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    };
    return evaluate({ localStorage }, id, groups, query, useState,
      preferences.readMenuFavorites, preferences.saveMenuFavorites, preferences.menuEntryMatches,
      preferences.MENU_FAVORITES_LIMIT, value => { status = value; },
      { activeElement: null }, class HTMLElement {}, { current: null });
  };
  return { seed, persisted, render, localStorage, get status() { return status; },
    denyWrites: () => { denyWrites = true; } };
}
let passed = 0;
const test = (name, run) => { run(); passed++; console.log(`PASS menu-role: ${name}`); };
test('saved admin favorites remain usable for an administrator', () => {
  const h = harness(); h.seed('A', [...privileged, 'roster', 'radar']);
  assert.equal(h.render().favoriteItems.length, 5);
});
test('role downgrade immediately frees hidden slots before any effect', () => {
  const h = harness(); h.seed('A', [...privileged, 'roster', 'radar']); h.render();
  assert.deepEqual(h.render('A', false).menuFavorites, ['roster', 'radar']);
});
test('cold start filters hidden favorites before counting', () => {
  const h = harness(); h.seed('A', [...privileged, 'roster', 'radar']);
  assert.deepEqual(h.render('A', false).menuFavorites, ['roster', 'radar']);
});
test('all five visible slots can be filled and a sixth is refused', () => {
  const h = harness(); h.seed('A', [...privileged, 'roster', 'radar']); h.render();
  for (const id of ['departure', 'cockpit', 'settings']) h.render('A', false).toggleMenuFavorite(id);
  assert.deepEqual(h.persisted('A'), normal.slice(0, 5));
  h.render('A', false).toggleMenuFavorite('hotels');
  assert.equal(h.persisted('A').length, 5); assert.match(h.status, /até 5/);
});
test('hidden destination cannot be added by the toggle handler', () => {
  const h = harness(); h.seed('A', ['roster']);
  h.render('A', false).toggleMenuFavorite('admin');
  assert.deepEqual(h.persisted('A'), ['roster']); assert.match(h.status, /indisponível/);
});
test('search does not redefine the allowed catalog or drop favorites', () => {
  const h = harness(); h.seed('A', ['roster', 'radar']);
  assert.deepEqual(h.render('A', false, 'hotels').menuFavorites, ['roster', 'radar']);
});
test('account switch cannot render previous account favorites before effects', () => {
  const h = harness(); h.seed('A', ['admin']); h.seed('B', ['hotels']); h.render('A');
  assert.deepEqual(h.render('B').menuFavorites, ['hotels']);
});
test('anonymous render neither inherits nor saves favorites', () => {
  const h = harness(); h.seed('A', ['settings']); h.render('A');
  const anonymous = h.render(null); assert.deepEqual(anonymous.menuFavorites, []);
  anonymous.toggleMenuFavorite('roster'); assert.deepEqual(h.persisted('A'), ['settings']);
});
test('role inspection does not destructively rewrite saved preferences', () => {
  const h = harness(); h.seed('A', ['admin', 'roster']); h.render('A'); h.render('A', false);
  assert.deepEqual(h.persisted('A'), ['admin', 'roster']);
  assert.deepEqual(h.render('A').menuFavorites, ['admin', 'roster']);
});
test('failed persistence reports failure without phantom favorite', () => {
  const h = harness(); h.seed('A', ['roster']); h.denyWrites();
  h.render('A', false).toggleMenuFavorite('hotels');
  assert.deepEqual(h.render('A', false).menuFavorites, ['roster']); assert.match(h.status, /Não foi possível salvar/);
});
test('empty visible catalog cannot retain invisible favorites', () => {
  const h = harness(); h.seed('A', ['roster']); h.render();
  assert.deepEqual(h.render('A', false, '', []).menuFavorites, []);
});
test('corrupt preference recovers only defaults in the visible catalog', () => {
  const h = harness(); h.localStorage.setItem(preferences.menuFavoritesKey('A'), '{bad-json');
  assert.deepEqual(h.render('A', false).menuFavorites, ['roster', 'radar', 'departure']);
});
console.log(`PASS: ${passed} prepared-menu role/account favorite scenarios`);
