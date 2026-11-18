import assert from 'node:assert/strict';
import { CREWCHECK_GATE_HOST_ENABLED,changeGateConsent,createGateOutboxConnection } from '../server/web-push/gateHost.mjs';
import { handleCrewCheckPush } from '../server/web-push/api.mjs';
assert.equal(CREWCHECK_GATE_HOST_ENABLED,false);
const forbidden=new Proxy({}, {get(){throw Error('OFF cannot touch storage/source/authority/provider');}});
assert.equal((await changeGateConsent(forbidden,forbidden,forbidden)).status,'disabled');
assert.equal((await changeGateConsent(forbidden,forbidden,forbidden,{enabled:'true'})).status,'disabled');
assert.equal((await createGateOutboxConnection({enabled:'true'}).dispatch(forbidden,forbidden,forbidden)).status,'disabled');
const connection=createGateOutboxConnection({readSource:forbidden});
assert.equal((await connection.enqueue(forbidden,forbidden,forbidden)).status,'disabled');
assert.equal((await connection.dispatch(forbidden,forbidden,forbidden,forbidden)).status,'disabled');
let status,body;const res={setHeader(){},writeHead(code){status=code;},end(raw){body=JSON.parse(raw);}};
const owner='owner_fixture_A';
await handleCrewCheckPush({method:'POST',headers:{origin:'https://fixture.test'}},res,new URL('https://fixture.test/api/platform/notifications/crewcheck-installation'),{
 identify:async()=>({payload:{sub:owner},profile:{public_id:owner},db:forbidden}),configuration:()=>({origin:'https://fixture.test'}),read:async()=>({action:'gate-consent',installationId:'installation_fixture_01',enabled:true,confirmed:true,expectedRevision:0,expectedInstallationRevision:1})});
assert.equal(status,503);assert.equal(body.code,'GATE_HOST_DISABLED');
const url=new URL('https://fixture.test/api/platform/notifications/crewcheck-installation'),NOW=Date.parse('2032-10-14T12:00:00Z');
const consent={action:'gate-consent',installationId:'installation_fixture_01',enabled:true,confirmed:true,expectedRevision:0,expectedInstallationRevision:1};
const revoke={...consent,enabled:false,confirmed:false,expectedRevision:1};
const call=async(input,{identity={payload:{sub:owner},profile:{public_id:owner},db:forbidden},...options}={})=>{status=body=undefined;
 await handleCrewCheckPush({method:'POST',headers:{origin:'https://fixture.test'}},res,url,{identify:async()=>identity,configuration:()=>({origin:'https://fixture.test'}),read:async()=>input,clock:()=>NOW,...options});return {status,body};};
// Only the literal boolean true from the code switch enables the action; nothing reaches storage otherwise.
for(const input of [consent,revoke])for(const gateHostEnabled of [undefined,()=>'true',()=>1,()=>({}),()=>[true],()=>undefined]){
 const result=await call(input,gateHostEnabled?{gateHostEnabled}:{});assert.equal(result.status,503);assert.deepEqual(result.body,{ok:false,code:'GATE_HOST_DISABLED'});
}
// Expected refusal from the actual consent fence: 409, generic, before any storage access.
const valid={email:'gate-a@example.test',profile:{public_id:owner},payload:{iss:'crewcheck',aud:'crewcheck-web',sub:owner,email:'gate-a@example.test',jti:'watch1_'+'a'.repeat(64),iat:Math.floor(NOW/1000)-60,exp:Math.floor(NOW/1000)+600,mustChangePassword:false}};
const conflictCases=[[consent,{payload:{sub:owner},profile:{public_id:owner}}],[{...consent,authorityEpoch:'b'.repeat(64)},valid],[{...consent,sessionId:valid.payload.jti},valid],[{...consent,expectedInstallationRevision:0},valid],[{...consent,confirmed:false},valid],[{...revoke,expectedRevision:-1},valid]];
for(const [input,identity] of conflictCases){
 const result=await call(input,{identity:{...identity,db:forbidden},gateHostEnabled:()=>true});
 assert.equal(result.status,409);assert.deepEqual(Object.keys(result.body).sort(),['code','message','ok']);assert.equal(result.body.code,'GATE_CONSENT_CONFLICT');assert.equal(result.body.ok,false);
}
// A fence refusal raised inside the open transaction is still a 409, rolled back and released.
const tx={rollback:0,release:0,commit:0};
const emptyRegistry={getConnection:async()=>({query:async()=>[[]],execute:async()=>[[]],beginTransaction:async()=>{},commit:async()=>{tx.commit++;},rollback:async()=>{tx.rollback++;},release:()=>{tx.release++;}})};
for(const input of [consent,revoke]){
 const result=await call(input,{identity:{...valid,db:emptyRegistry},gateHostEnabled:()=>true});
 assert.equal(result.status,409);assert.equal(result.body.code,'GATE_CONSENT_CONFLICT');
}
assert.deepEqual(tx,{rollback:2,release:2,commit:0});
// Unknown storage/driver failures are internal, even when they carry status 409 or a sensitive message.
const logged=[],consoleError=console.error;console.error=(...args)=>logged.push(args.join(' '));
try{
for(const failure of [Error('synthetic pool failure secret-fixture'),Object.assign(Error('ER_LOCK_DEADLOCK secret-fixture'),{status:409,code:'ER_LOCK_DEADLOCK'}),new TypeError('synthetic driver bug secret-fixture')]){
 const db={getConnection:async()=>{throw failure;}};
 for(const input of [consent,revoke]){
  const result=await call(input,{identity:{...valid,db},gateHostEnabled:()=>true});
  assert.equal(result.status,500);assert.deepEqual(result.body,{ok:false,code:'GATE_CONSENT_UNAVAILABLE',message:'Não foi possível registrar agora.'});
  assert(!JSON.stringify(result.body).includes('secret-fixture'));
 }
}
// A failure after the transaction opened is rolled back and still reported as internal.
let rolledBack=0,released=0;const broken={getConnection:async()=>({query:async sql=>{if(/^SET TRANSACTION/.test(sql))return [[]];throw Error('synthetic query failure secret-fixture');},beginTransaction:async()=>{},commit:async()=>{throw Error('commit must not run');},rollback:async()=>{rolledBack++;},release:()=>{released++;}})};
const midway=await call(revoke,{identity:{...valid,db:broken},gateHostEnabled:()=>true});
assert.equal(midway.status,500);assert.equal(midway.body.code,'GATE_CONSENT_UNAVAILABLE');assert.equal(rolledBack,1);assert.equal(released,1);
}finally{console.error=consoleError;}
// Internal failures stay observable without the driver message.
assert.equal(logged.length,7);assert(logged.every(line=>line.startsWith('[crewcheck:gate-consent] ')&&!line.includes('secret')));assert(logged.includes('[crewcheck:gate-consent] ER_LOCK_DEADLOCK'));
console.log('PASS real installation API gate action and outbox connection default OFF: no storage/source/provider/authority access, no caller-controlled activation');
console.log('PASS gate consent API errors: fence refusal 409 GATE_CONSENT_CONFLICT before or inside the rolled-back transaction; driver/unknown failures 500 GATE_CONSENT_UNAVAILABLE with rollback, code-only log and no detail; consent and revoke never enabled by truthy non-true switches');
