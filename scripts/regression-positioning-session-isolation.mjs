import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['positioningContext','positioningEventKey','positioningSearchKey','positioningRecordMatchesEvent','departurePositioningRecord','readPositioningSearch','writePositioningSearch','savePositioningFlight','discoverSameDayPositioningFlight','positioningLocalIsoDate','positioningFlightNumber','positioningDestination','positioningStatus','positioningCancelled','positioningDateTime','positioningBoardRows','positioningDepartureAt','positioningArrivalAt','positioningRecordLabel'];
const snippets = names.map(name => ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(ast)).join('\n');
let account = 'A', origin = 'synthetic-origin-1', active = true;
const records = new Map(), writes = [], events = [], requests = [];
const storage = { get: (key, fallback) => records.get(key) ?? fallback, set: (key, value) => { records.set(key, value); writes.push({ key, value }); } };
const env = { storage, getStoredUser: () => ({ id: account }), eventRouteOrigin: () => origin, departurePresentationDateTime: event => new Date(event.reportAt), departureConfirmedSameDayPositioning: () => false,
  pad2: value => String(value).padStart(2,'0'), POSITIONING_SEARCH_WINDOW_MS: 72*3600000, POSITIONING_SEARCH_CACHE_MS: 3*3600000, POSITIONING_ERROR_CACHE_MS: 1800000, POSITIONING_MIN_ARRIVAL_BUFFER_MS: 3600000, POSITIONING_MAX_STATUS_LOOKUPS: 4,
  window: { dispatchEvent: event => events.push(event) }, CustomEvent: class { constructor(type, init) { this.type=type; this.detail=init.detail; } }, fetch: () => new Promise((resolve,reject) => requests.push({ resolve,reject })) };
const api = new Function(...Object.keys(env), ts.transpileModule(snippets, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return {'+names.join(',')+'};')(...Object.values(env));
const event = { id: 'same-event', origin: 'BSB', destination: 'GRU', presentation: '12:00', departure: '13:00', reportAt: new Date(Date.now()+7200000).toISOString() };
const global = { eventId: event.id, destination: 'BSB', confirmed:true, expiresAt: new Date(Date.now()+3600000).toISOString() };
records.set('crewcheck_selected_positioning_flight', JSON.stringify(global));
assert.equal(api.departurePositioningRecord(event),null,'global legacy record without origin/account provenance is never reused');
const valid = { ...global, contextId: api.positioningContext(event) };
records.set(api.positioningEventKey(event), JSON.stringify(valid));
assert.deepEqual(api.departurePositioningRecord(event),valid);
account='B'; assert.equal(api.departurePositioningRecord(event),null);
account='A'; origin='synthetic-origin-2'; assert.equal(api.departurePositioningRecord(event),null);
origin='synthetic-origin-1'; records.clear();
async function lateChange(change, fail=false) {
  active=true; account='A'; origin='synthetic-origin-1'; records.clear(); writes.length=0; events.length=0;
  const originalKey=api.positioningSearchKey(event);
  const pending=api.discoverSameDayPositioningFlight(event,'FLN','BSB',()=>active);
  assert.equal(JSON.parse(records.get(originalKey)).status,'checking');
  change();
  const request=requests.shift();
  if(fail) request.reject(Error('synthetic offline')); else request.resolve({json:async()=>({rows:[]})});
  assert.equal(await pending,null);
  assert.equal(records.get(originalKey),'','old checking state is cleared after cancellation');
  assert.equal(writes.length,2,'only own initial checking and its cleanup may write');
  assert.equal(events.length,0,'late response never publishes to another session');
}
await lateChange(()=>{account='B';origin='synthetic-origin-2';});
await lateChange(()=>{origin='synthetic-origin-2';});
await lateChange(()=>{active=false;});
await lateChange(()=>{account='B';},true);
account='A';origin='synthetic-origin-1';active=true;records.clear();
const successful=api.discoverSameDayPositioningFlight(event,'FLN','BSB',()=>active);
requests.shift().resolve({json:async()=>({rows:[]})}); await successful;
assert.equal(api.readPositioningSearch(event).status,'none','same-context negative result is retained');
assert.equal(records.has('crewcheck_selected_positioning_flight'),false);
console.log('PASS real positioning helpers: global provenance rejection, account/origin cache isolation, late success/error/context cleanup, no cross-session events, same-context negative caching');
