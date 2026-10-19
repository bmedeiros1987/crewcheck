import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { verifyHotelMaintenance } from './build-hotel-maintenance.mjs';

// Fixture identities only. This is not authentication/account-deletion certification.
globalThis.fetch=()=>{throw new Error('External network forbidden in maintenance contract');};
const root=path.resolve(process.argv[2]||process.cwd());
verifyHotelMaintenance(root);
const {hotelReadiness,runHotelTransaction,reconcileHotelRoster}=await import(pathToFileURL(path.join(root,'server/hotel-stay-repository.mjs')).href);
const {hotelProjection}=await import(pathToFileURL(path.join(root,'server/hotel-stay-model.mjs')).href);
const {hotelDatabase,syntheticHotel}=await import(pathToFileURL(path.join(root,'scripts/fixtures/hotel-database.mjs')).href);
const source=fs.readFileSync(path.join(root,'server/platform.mjs'),'utf8');
const ast=ts.createSourceFile('platform.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const literal=name=>ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)?.getText(ast).replace(/^export /,'');
const names=['handleStays','saveRosterMysql','handleRosterSync','handleLegacyDatabase','handlePlatformRoute','syncRosterForContext','syncLinkedTelegramRoster'];
const prepared=Boolean(literal('syncLinkedTelegramRoster'));
const noHotelDml=log=>assert.deepEqual(log.filter(({sql})=>/\b(?:INSERT\s+(?:IGNORE\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+`?crewcheck_platform_(?:stays|hotel_rules)\b/i.test(sql)),[],'zero attempted hotel/rule DML, including rollback attempts');
let assertions=0;
function fixture(options={},authorization='owner') {
  const record=syntheticHotel({row_version:'9007199254740995',room_cipher:'fictional-private-room'});
  const d=hotelDatabase([record,syntheticHotel({id:'other',owner_email:'other-owner'})],options);
  const nativeQuery=d.db.query.bind(d.db);
  const db={...d.db,query:async(sql,params)=>{
    if (options.probeError && sql.includes('information_schema.')) throw new Error('Synthetic metadata failure');
    if (options.readError && sql.startsWith('SELECT s.*')) throw new Error('Synthetic read failure');
    if (sql.startsWith('SELECT * FROM crewcheck_platform_profiles')) return {rows:[{email:'owner-A'}],rowCount:1};
    return nativeQuery(sql,params);
  }};
  const context={db,identity:{email:'owner-A'}};
  const sandbox={hotelReadiness,runHotelTransaction,reconcileHotelRoster,hotelProjection,
    readBody:async req=>req.body,requireMain:async(req,res)=>authorization==='none'?(Object.assign(res,{status:401,body:{ok:false}}),null):context,
    requirePremium:async(context,res)=>authorization==='nonpremium'?(Object.assign(res,{status:403,body:{ok:false}}),false):true,
    normalizeText:(v,n)=>String(v??'').trim().slice(0,n),parseDateOnly:v=>String(v||'').slice(0,10),hotelKey:v=>v.toLowerCase().replaceAll(' ','-'),decryptPrivate:v=>v||'',
    sanitizeRoster:v=>structuredClone(v),rosterKey:v=>`${v.year}-${String(v.month).padStart(2,'0')}`,rosterFingerprint:()=> 'fictional',rosterSummary:v=>v,
    crypto:{randomUUID:()=> 'fictional-roster'},safeEmail:v=>v,sendJson:(res,status,body)=>Object.assign(res,{status,body}),enforcePlatformMethod:()=>true,
    env:()=>'',RELEASE_JOURNAL_PATH:'/unrelated-release',FINANCIAL_FX_PATH:'/unrelated-fx',FINANCIAL_LEDGER_PATH:'/unrelated-ledger',FINANCIAL_UPCOMING_PATH:'/unrelated-upcoming',FINANCIAL_CAPTURE_PATH:'/unrelated-capture'};
  const functions=vm.runInNewContext(names.map(literal).filter(Boolean).join('\n')+'\n({'+names.filter(literal).join(',')+'})',sandbox);
  return {...d,get rows(){return d.rows;},get rosters(){return d.rosters;},db,record,functions,async request(method,body={},url='/api/platform/hotels/stays'){
    const res={};await functions.handlePlatformRoute({method,body},res,new URL(url,'http://fixture.invalid'));return res;
  }};
}
const pending=value=>{assert.equal(value.status,'review-required');assert.equal(value.reason,'maintenance-read-only');};
const unchanged=(fixture,before)=>assert.deepEqual(fixture.rows,before,'live synthetic database state must remain unchanged');
for(const options of [{},{ready:false},{schemaPatch:{column_name:'row_version',data_type:'int'}},{probeError:true}]) {
  const f=fixture(options),before=f.rows;
  const get=await f.request('GET');assert.equal(get.status,200);assert.equal(get.body.hotelWriteReady,false);assert.equal(get.body.hotelReadiness,'maintenance-read-only');
  assert.equal(get.body.stays.length,1);assert.equal(get.body.stays[0].room,'fictional-private-room');
  for(const method of ['PATCH','POST']) for(const payload of [{},{hotelName:'Legacy caller'},{contractVersion:1},{contractVersion:2,action:'patch',id:'stay-A',expectedVersion:'9007199254740995'}]) {
    for(let retry=0;retry<2;retry++) {const result=await f.request(method,payload);assert.equal(result.status,503);assert.equal(result.body.code,'HOTEL_MAINTENANCE_READ_ONLY');assert.equal(result.body.persisted,false);}
  }
  const forbidden={connect:()=>{throw new Error('Direct blocked edit must not connect');},query:()=>{throw new Error('Direct blocked edit must not probe');}};
  await assert.rejects(runHotelTransaction(forbidden,{action:'associate'},{}),{code:'HOTEL_MAINTENANCE_READ_ONLY',status:503,persisted:false});
  await assert.rejects(runHotelTransaction(forbidden,{action:'patch'},{}),{code:'HOTEL_MAINTENANCE_READ_ONLY'});
  pending(await runHotelTransaction(forbidden,{action:'sync'},{}));pending(await reconcileHotelRoster(forbidden,{},{}));
  const body={roster:{year:2030,month:1,days:[{date:'2030-01-01',hotel:'Imported fictional hotel'}]},compliance:{fictional:true},gym:[{fictional:true}]};
  for(const url of ['/api/platform/rosters/sync','/api/rosters']) {
    const result=await f.request('POST',body,url);assert.equal(result.status,200);assert.equal(result.body.ok,true);pending(result.body.hotelReconciliation);
  }
  if(prepared) {const result=await f.functions.syncLinkedTelegramRoster({email:'owner-A',...body},{db:f.db});assert.equal(result.ok,true);pending(result.hotelReconciliation);}
  unchanged(f,before);noHotelDml(f.log);assert(f.log.some(({sql})=>sql.includes('INSERT INTO crewcheck_platform_rosters')));
  assertions++;
}
const concurrent=fixture(),concurrentBefore=concurrent.rows;
const concurrentBody={roster:{year:2030,month:1,days:[{date:'2030-01-01',hotel:'Concurrent fictional hotel'}]}};
const races=await Promise.all(Array.from({length:8},(_,i)=>i%2?concurrent.request('PATCH',{contractVersion:2,action:'patch'}):concurrent.request('POST',concurrentBody,'/api/platform/rosters/sync')));
for(let i=0;i<races.length;i++) {assert.equal(races[i].status,i%2?503:200);if(i%2)assert.equal(races[i].body.persisted,false);else pending(races[i].body.hotelReconciliation);}
unchanged(concurrent,concurrentBefore);noHotelDml(concurrent.log);assertions++;
for(const authorization of ['none','nonpremium']) {
  const f=fixture({},authorization);for(const method of ['GET','PATCH']) {const result=await f.request(method);assert.equal(result.status,authorization==='none'?401:403);}
  assert.equal(f.log.length,0);assertions++;
}
// Negative control is a separate, deliberately mutated synthetic database.
// Both the live-state oracle and the attempted-DML oracle must detect it. It is
// excluded from the positive-path zero-DML count and never touches a real DB.
const control=fixture(),controlBefore=control.rows,controlRow=controlBefore[0];
const changed=await control.db.query(`UPDATE crewcheck_platform_stays SET binding_id=$1,binding_evidence=$2,
 manual_hotel_override=$3,hotel_source_snapshot=$4,hotel_name=$5,hotel_key=$6,row_version=$7,roster_key=$8
 WHERE id=$9 AND owner_email=$10 AND row_version=$11`,[controlRow.binding_id,controlRow.binding_evidence,
 controlRow.manual_hotel_override,controlRow.hotel_source_snapshot,'Negative control mutation',controlRow.hotel_key,
 controlRow.row_version,controlRow.roster_key,controlRow.id,controlRow.owner_email,controlRow.row_version]);
assert.equal(changed.rowCount,1);assert.equal(control.rows[0].hotel_name,'Negative control mutation');
assert.equal(controlBefore[0].hotel_name,controlRow.hotel_name);
assert.throws(()=>unchanged(control,controlBefore),{code:'ERR_ASSERTION'});
assert.throws(()=>noHotelDml(control.log),{code:'ERR_ASSERTION'});assertions++;
const failed=fixture({readError:true});const failure=await failed.request('GET');assert.equal(failure.status,500);assert.equal(failure.body.ok,false);
// Invoke the literal handler directly as well: read errors must propagate, never a
// manufactured successful maintenance response. Outer routing error formatting is unchanged.
await assert.rejects(failed.functions.handleStays({method:'GET',body:{}},{}),/Synthetic read failure/);noHotelDml(failed.log);
// Existing account deletion remains byte-for-byte outside the scoped fence. A
// complete no-write/deployment claim is deliberately forbidden by the manifest.
assert(!literal('handleStays').includes('process.env'));
console.log(JSON.stringify({mode:'hotel-maintenance-read-only',prepared,scenarios:assertions,attemptedHotelDml:0,negativeControlDml:1,liveStateNegativeControlDetected:true,realAccounts:false,authCertified:false,httpDeletionCertified:false,hold:true}));
