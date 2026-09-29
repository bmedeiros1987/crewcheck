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
assert.equal(save(storage,'A','aims'), true);
assert.equal(read(storage,'A'), 'aims');
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
assert.ok(prepared.includes('aria-pressed={layout === \'cards\'}'), 'cards option must expose selected state');
assert.ok(prepared.includes('aria-pressed={layout === \'list\'}'), 'list option must expose selected state');
assert.ok(prepared.includes('aria-pressed={layout === \'aims\'}'), 'AIMS option must expose selected state');
assert.ok(prepared.includes('<AimsRosterTable events={ordered}/>'), 'AIMS must use its own renderer');
assert.ok(!prepared.includes('<select value={layout}'), 'layout must not fall back to the raw select control');
assert.ok(prepared.includes('data-roster-iso={group.iso}'), 'date navigation remains reachable');
const aimsTable = fs.readFileSync('client/src/components/v1391/AimsRosterTable.tsx', 'utf8');
for (const heading of ['Data', 'Código / atividade', 'Apresentação', 'Origem', 'Partida', 'Destino', 'Chegada', 'Detalhes publicados']) {
  assert.ok(aimsTable.includes(`<th scope="col">${heading}</th>`), `missing AIMS column: ${heading}`);
}
assert.ok(aimsTable.includes('<table>'), 'AIMS must be a semantic table, not compacted cards');
assert.ok(aimsTable.includes('data-roster-iso={iso}'), 'AIMS rows must preserve date navigation');
assert.doesNotMatch(aimsTable, /finance|salary|perDiem|parser/i, 'AIMS renderer must not invent finance or parser logic');
const layoutCss = fs.readFileSync('client/src/components/v1391/roster-layout.css', 'utf8');
assert.match(layoutCss, /data-roster-layout="list"[\s\S]*display: flex !important;/, 'list mode must win the premium stylesheet cascade');
assert.match(layoutCss, /\.cc-roster-layout-reset[\s\S]*min-height: 44px;/, 'reset action must keep the mobile touch target');
console.log('PASS: account isolation, reload, reset, accessible Cards/List/AIMS picker, semantic AIMS table and prepared integration');
