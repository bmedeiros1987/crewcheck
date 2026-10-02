import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(fs.readFileSync('client/src/lib/rosterLayoutPreference.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { readRosterLayout: read, saveRosterLayout: save, rosterLayoutKey: key, readRosterZoom: zoom } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const data = new Map();
const storage = { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
assert.equal(read(storage,'A'), 'cards');
assert.equal(save(storage,'A','list'), true);
assert.equal(read(storage,'A'), 'list');
assert.equal(read(storage,'B'), 'cards');
assert.equal(save(storage,'A','aims'), true);
assert.equal(read(storage,'A'), 'aims');
assert.equal(read(storage,'B'), 'cards');
assert.equal(save(storage,'A','calendar'), true);
assert.equal(read(storage,'A'), 'calendar');
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
assert.match(prepared, /<select aria-label="Formato da escala" value=\{layout\}/, 'native picker exposes current value and accessible name');
for (const layout of ['cards','list','aims','calendar']) assert.ok(prepared.includes(`<option value="${layout}">`), `missing native option ${layout}`);
assert.ok(prepared.includes("<AimsRosterTable events={timedEvents} dayView={zoom === 'day'}/>"), 'AIMS must use its own renderer');
assert.ok(prepared.includes('<CalendarRosterView events={ordered} month={selectedMonth} zoom={zoom} selectedDay={activeDay} onSelectDay={selectDay}/>'), 'calendar must use its own renderer');

assert.ok(prepared.includes('data-roster-iso={group.iso}'), 'date navigation remains reachable');
const aimsTable = fs.readFileSync('client/src/components/v1391/AimsRosterTable.tsx', 'utf8');
for (const heading of ['Data', 'Código / atividade', 'Apresentação', 'Origem', 'Partida', 'Destino', 'Chegada', 'Detalhes publicados']) {
  assert.ok(aimsTable.includes(`<th scope="col">${heading}</th>`), `missing AIMS column: ${heading}`);
}
assert.ok(aimsTable.includes('<table>'), 'AIMS must be a semantic table, not compacted cards');
assert.ok(aimsTable.includes('data-roster-iso={iso}'), 'AIMS rows must preserve date navigation');
assert.doesNotMatch(aimsTable, /finance|salary|perDiem|parser/i, 'AIMS renderer must not invent finance or parser logic');
const calendar = fs.readFileSync('client/src/components/v1391/CalendarRosterView.tsx', 'utf8');
assert.ok(calendar.includes('<table>'), 'calendar must be a semantic monthly table');
assert.ok(calendar.includes("const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']"), 'calendar must keep the full Monday-to-Sunday week');
assert.ok(calendar.includes('data-roster-iso={iso}'), 'calendar cells must preserve date navigation');
assert.ok(calendar.includes('dayEvents.map((event)'), 'calendar must render every event in each day');
assert.doesNotMatch(calendar, /dayEvents\.slice\(0,\s*\d+\)/, 'calendar must not hide valid events behind an arbitrary cap');
assert.doesNotMatch(calendar, /finance|salary|perDiem|parser/i, 'calendar renderer must not invent finance or parser logic');
const layoutCss = fs.readFileSync('client/src/components/v1391/roster-layout.css', 'utf8');
assert.match(layoutCss, /data-roster-layout="list"[\s\S]*display: flex !important;/, 'list mode must win the premium stylesheet cascade');
assert.match(layoutCss, /\.cc-roster-layout-reset[\s\S]*min-height: 44px;/, 'reset action must keep the mobile touch target');
console.log('PASS: account isolation, reload, reset, accessible Cards/List/AIMS/Calendar picker, complete calendar and prepared integration');

assert.equal(zoom(storage, 'A'), 'month');
assert.equal(save(storage, 'A', 'aims', 'day'), true);
assert.equal(zoom(storage, 'A'), 'day');
assert.equal(zoom(storage, 'B'), 'month');
assert.equal(save(storage, 'A', 'calendar'), true);
assert.equal(zoom(storage, 'A'), 'day', 'changing layout preserves zoom');
assert.equal(save(storage, 'A', 'cards', 'month'), true);
assert.equal(zoom(storage, 'A'), 'month');
assert.equal(zoom(blocked, 'A'), 'month');
assert.equal(save(storage, null, 'aims', 'day'), false);
assert.equal(save(storage, 'A', 'aims', 'week'), false);
console.log('PASS: backward-compatible month/day preference, reload, reset, account isolation and blocked storage');
