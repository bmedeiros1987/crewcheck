import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync('client/src/lib/rosterLayoutPreference.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { readRosterLayout: read, saveRosterLayout: save, rosterLayoutKey: key } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const data = new Map();
const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
assert.equal(read(storage,'A'), 'cards');
assert.equal(save(storage,'A','list'), true);
assert.equal(read(storage,'A'), 'list');
assert.equal(read(storage,'B'), 'cards');
assert.equal(save(storage,null,'list'), false);
assert.equal(read(storage,null), 'cards');
for (const raw of ['invalid', '{"version":2,"layout":"list"}', '{"version":1,"layout":"unknown"}']) {
  data.set(key('A'), raw); assert.equal(read(storage,'A'), 'cards');
}
const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() {} };
assert.equal(read(blocked,'A'), 'cards');
assert.equal(save(blocked,'A','list'), false);
assert.equal(save(storage,'A','cards'), true);
assert.equal(read(storage,'A'), 'cards');
const prepared = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx','utf8');
assert.ok(prepared.includes('data-roster-layout={layout}'), 'selector must survive canonical preparation');
assert.ok(prepared.includes('Visualização da escala'));
assert.ok(prepared.includes('data-roster-iso={group.iso}'), 'date navigation remains reachable');
console.log('PASS: account isolation, reload, reset, invalid versions, blocked storage and prepared integration');
