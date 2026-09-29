import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('client/src/lib/homeLayoutPreference.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const home = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };

assert.equal(home.readHomeLayout(storage, 'A').mode, 'standard');
assert.equal(home.saveHomeLayout(storage, 'A', { version: 1, mode: 'personalized', order: ['smart','next','summary','finance','limits'], visible: ['smart','next'] }), true);
assert.deepEqual(home.visibleHomeSlots(home.readHomeLayout(storage, 'A'), home.HOME_SLOT_ORDER), ['smart','next','summary','limits']);
assert.equal(home.readHomeLayout(storage, 'B').mode, 'standard', 'account B must not inherit account A');
assert.equal(home.saveHomeLayout(storage, null, home.DEFAULT_HOME_LAYOUT), false, 'anonymous preference must not persist');
values.set(home.homeLayoutKey('A'), JSON.stringify({ version: 1, mode: 'mixed', order: ['finance'], visible: [] }));
const normalized = home.readHomeLayout(storage, 'A');
assert.deepEqual(normalized.order, ['finance','summary','next','limits','smart']);
assert.ok(normalized.visible.includes('summary') && normalized.visible.includes('next') && normalized.visible.includes('limits'), 'critical slots remain visible');
assert.equal(home.resetHomeLayout(storage, 'A'), true);
assert.equal(home.readHomeLayout(storage, 'A').mode, 'standard');

const shell = fs.readFileSync('client/src/components/v1391/HomeLayoutShell.tsx', 'utf8');
assert.match(shell, /PRÉVIA E PREFERÊNCIAS/);
assert.match(shell, /Padrão CrewCheck/);
assert.match(shell, /Personalizada/);
assert.match(shell, /Mista/);
assert.match(shell, /Restaurar padrão/);
assert.match(shell, /Salvar/);
assert.match(shell, /Cancelar/);
assert.match(shell, /aria-pressed=\{enabled\}/);
assert.match(shell, /Essencial · sempre visível/);
assert.doesNotMatch(shell, /financeEngine|parsePDF|compareRosters/, 'Home editor must not duplicate domain engines');

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(source, /<HomeLayoutShell slots=\{slots\}/);
for (const id of ['summary','finance','next','limits','smart']) assert.match(source, new RegExp(`id: '${id}'`));
assert.match(source, /alertCount/);

const css = fs.readFileSync('client/src/components/v1391/home-layout.css', 'utf8');
assert.match(css, /min-height:44px/);
assert.match(css, /prefers-reduced-motion:reduce/);
console.log('PASS: Home mode, account isolation, ordering, save/cancel/reset and required operational slots');
