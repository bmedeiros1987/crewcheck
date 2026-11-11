import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {nativeMutationPlan,NATIVE_PROJECT,NATIVE_PACKAGE,createNativeRegistryPlatformAdapter,readNativeInstallation,deleteNativeAccountWithRegistry} from '../server/native-push/registry.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {nativeProtocolMutation as parse,nativeProtocolAcknowledgement as ack,nativeProtocolHost,applyNativeProtocolMutation,createNativeRegistryAuthenticatedHandler,createNativeRegistryExistingIdentityHandler,NATIVE_REGISTRY_PATH} from '../server/native-push/protocol-adapter.mjs';
const identity={ownerId:'synthetic-owner-a',email:'native-a@example.test'};
const wire={action:'register',projectId:NATIVE_PROJECT,package:NATIVE_PACKAGE,installationId:'synthetic-device-a',mutationId:'synthetic-operation-1',expectedRevision:0,expectedConsentRevision:0,generation:'1',tokenRevision:'1',consent:true,token:'SYNTHETIC_PROTOCOL_TOKEN_NOT_REAL'};
let count=0;function check(fn){fn();count++;}
const input=parse(identity,wire),record=nativeMutationPlan(null,input,1000).next;
const summary=r=>({installationId:r.installationId,revision:r.revision,consentRevision:r.consentRevision,generation:r.generation,tokenRevision:r.tokenRevision,active:r.active,duplicate:false,registryConfirmed:true,received:null});
check(()=>assert.equal(input.generation,1));
check(()=>assert.equal(ack(input,summary(record)).registered,true));
check(()=>assert.equal(ack(input,summary(record)).received,null));
check(()=>assert(!JSON.stringify(ack(input,summary(record))).includes(wire.token)));
for(const value of ['01','1.0','1e2',' 1','+1','-1','9007199254740992',true,null,1.1])check(()=>assert.throws(()=>parse(identity,{...wire,generation:value})));
for(const patch of [{identity},{ownerId:identity.ownerId},{projectId:'other-project'},{package:'other.package'},{mutationId:undefined},{expectedRevision:undefined},{expectedRevision:Number.MAX_SAFE_INTEGER},{consent:false},{action:'rotate',consent:true},{token:'bad\ntoken'}])check(()=>assert.throws(()=>parse(identity,{...wire,...patch})));
check(()=>assert.throws(()=>parse(null,wire)));
for(const patch of [{registryConfirmed:false},{received:true},{revision:2},{consentRevision:0},{generation:2},{tokenRevision:2},{active:false},{installationId:'foreign-device'},{duplicate:undefined}])check(()=>assert.throws(()=>ack(input,{...summary(record),...patch})));
check(()=>assert.equal(ack(input,{...summary(record),duplicate:true}).duplicate,true));
const rotation=parse(identity,{...wire,action:'rotate',consent:false,mutationId:'synthetic-operation-2',expectedRevision:1,expectedConsentRevision:1,tokenRevision:'2',token:'SYNTHETIC_PROTOCOL_ROTATED_NOT_REAL'});
const rotated=nativeMutationPlan(record,rotation,1100).next;
check(()=>assert.equal(ack(rotation,summary(rotated)).consentRevision,1));
check(()=>assert.equal(nativeMutationPlan(rotated,rotation,1200).duplicate,true));
check(()=>assert.throws(()=>nativeMutationPlan(rotated,{...rotation,token:'SYNTHETIC_REUSED_ID_DIFFERENT_TOKEN'},1200),e=>e.code==='NATIVE_MUTATION_REUSED'));
const revokeWire={...wire,action:'revoke',consent:false,token:undefined,mutationId:'synthetic-operation-3',expectedRevision:2,expectedConsentRevision:1,tokenRevision:'2'};
const revoke=parse(identity,revokeWire),revoked=nativeMutationPlan(rotated,revoke,1300).next;
check(()=>assert.equal(ack(revoke,summary(revoked)).revoked,true));
check(()=>assert.equal(ack(revoke,summary(revoked)).registered,false));
check(()=>assert.throws(()=>parse(identity,{...revokeWire,token:wire.token})));
check(()=>assert.throws(()=>nativeMutationPlan(revoked,parse(identity,{...wire,mutationId:'synthetic-late-register',expectedRevision:3,expectedConsentRevision:2,tokenRevision:'2'}),1400),e=>e.code==='NATIVE_GENERATION_REVOKED'));
// Invalid wire is rejected before touching DB or protection. Host OFF reads nothing.
let accesses=0;const poison=new Proxy({}, {get(){accesses++;throw Error('unexpected I/O');}});
await assert.rejects(()=>applyNativeProtocolMutation(poison,identity,{...wire,expectedRevision:undefined},poison));count++;
assert.deepEqual(await nativeProtocolHost(poison),{enabled:false,configured:false,registered:false,received:null});count++;
assert.equal(accesses,0);count++;
// Execute the real platform SQL adapter, not a copy of its result/parameter API.
function platformFixture({commitFailure=false,queryFailure=false,beginFailure=false,rollbackFailure=false}={}) {
  const calls=[];let opens=0,releases=0,discards=0,profile=true;
  const native={getConnection:async()=>{opens++;return {
    query:async(sql,params=[])=>{
      calls.push({sql,params});
      if(queryFailure&&sql.startsWith('SELECT'))throw Error('SYNTHETIC_QUERY_FAILED');
      if(commitFailure&&sql==='COMMIT')throw Error('SYNTHETIC_COMMIT_UNCERTAIN');
      if(beginFailure&&sql==='BEGIN')throw Error('SYNTHETIC_BEGIN_UNCERTAIN');
      if(rollbackFailure&&sql==='ROLLBACK')throw Error('SYNTHETIC_ROLLBACK_UNCERTAIN');
      if(sql.startsWith('DELETE FROM crewcheck_platform_profiles')){profile=false;return [{affectedRows:1}];}
      if(sql.startsWith('SELECT public_id'))return [profile?[{public_id:identity.ownerId}]:[]];
      if(sql.startsWith('SELECT'))return [[]];
      return [{affectedRows:0}];
    },release(){releases++;},destroy(){discards++;}
  };}};
  return {db:mysqlAdapter(native),native,calls,opens:()=>opens,releases:()=>releases,discards:()=>discards};
}
for(const failure of [{queryFailure:true},{commitFailure:true},{beginFailure:true}]) {
 const f=platformFixture({...failure,rollbackFailure:true}),bridge=createNativeRegistryPlatformAdapter(f.db);
 await assert.rejects(readNativeInstallation(bridge.registryDb,identity,wire.installationId));count++;
 check(()=>assert.equal(f.releases(),0,'uncertain transaction must not return to pool'));
 check(()=>assert.equal(f.discards(),1,'uncertain transaction is discarded exactly once'));
 check(()=>assert.equal(f.opens(),1,'uncertain transaction never auto-retries'));
}
{
 const f=platformFixture({beginFailure:true}),bridge=createNativeRegistryPlatformAdapter(f.db);
 await assert.rejects(readNativeInstallation(bridge.registryDb,identity,wire.installationId));count++;
 check(()=>assert.equal(f.releases(),0));check(()=>assert.equal(f.discards(),1,'uncertain BEGIN is discarded even if cleanup responds'));
 const unfinished=platformFixture(),other=createNativeRegistryPlatformAdapter(unfinished.db),c=await other.registryDb.getConnection();
 await c.beginTransaction();c.release();c.release();check(()=>assert.equal(unfinished.discards(),1,'active connection cannot return to pool'));check(()=>assert.equal(unfinished.releases(),0));
 let releases=0,queries=0;
 const invalid=createNativeRegistryPlatformAdapter({dialect:'mysql',connect:async()=>({query:async()=>{queries++;},release(){releases++;}})});
 await assert.rejects(invalid.registryDb.getConnection(),e=>e.code==='NATIVE_PLATFORM_CONNECTION_INVALID');count++;
 check(()=>assert.equal(releases,1));check(()=>assert.equal(queries,0,'missing discard capability rejected before BEGIN'));
}
{
  const f=platformFixture(),bridge=createNativeRegistryPlatformAdapter(f.db);
  check(()=>assert.equal(f.opens(),0,'bridge construction has no I/O'));
  const receipt=await readNativeInstallation(bridge.registryDb,identity,wire.installationId);
  check(()=>assert.equal(receipt.revision,0));check(()=>assert.equal(f.opens(),1));check(()=>assert.equal(f.releases(),1));
  check(()=>assert.deepEqual(f.calls.map(c=>c.sql),['BEGIN','SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE','SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE','COMMIT']));
  check(()=>assert.deepEqual(f.calls[1].params,[identity.email],'numbered platform arguments survive translation'));
  const deletion=await deleteNativeAccountWithRegistry(bridge.registryDb,identity,bridge.canonicalDeletion(async client=>{
    const result=await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[identity.email]);
    assert.equal(result.rowCount,1,'canonical callback retains platform result contract');
  }));
  check(()=>assert.equal(deletion.registryConfirmed,true));check(()=>assert.equal(f.opens(),2,'deletion uses exactly one additional connection'));
  check(()=>assert.equal(f.releases(),2));
  check(()=>assert.equal(f.calls.filter(c=>c.sql==='BEGIN').length,2,'callback does not open/nest transaction'));
  await assert.rejects(bridge.canonicalDeletion(async()=>{} )({}),e=>e.code==='NATIVE_PLATFORM_TRANSACTION_REQUIRED');count++;
  check(()=>assert.throws(()=>createNativeRegistryPlatformAdapter({dialect:'postgres',connect(){}}),e=>e.code==='NATIVE_PLATFORM_DB_REQUIRED'));
  check(()=>assert.throws(()=>bridge.canonicalDeletion(null),e=>e.code==='NATIVE_DELETION_CALLBACK_REQUIRED'));
  const connection=await bridge.registryDb.getConnection();await connection.beginTransaction();const prior=f.calls.length;
  await assert.rejects(connection.query('SELECT ?',[]),e=>e.code==='NATIVE_PLATFORM_SQL_INVALID');count++;
  await assert.rejects(connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[]),e=>e.code==='NATIVE_PLATFORM_SQL_INVALID');count++;
  check(()=>assert.equal(f.calls.length,prior,'unsupported SQL/arity rejected before query'));
  await connection.rollback();connection.release();connection.release();
  await assert.rejects(connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',['x']),e=>e.code==='NATIVE_PLATFORM_CONNECTION_RELEASED');count++;
}
for(const kind of ['callback','notDeleted','query','commit']) {
  const f=platformFixture({commitFailure:kind==='commit',queryFailure:kind==='query'}),bridge=createNativeRegistryPlatformAdapter(f.db);
  if(kind==='query'||kind==='commit')await assert.rejects(readNativeInstallation(bridge.registryDb,identity,wire.installationId));
  else await assert.rejects(deleteNativeAccountWithRegistry(bridge.registryDb,identity,bridge.canonicalDeletion(async()=>{if(kind==='callback')throw Error('SYNTHETIC_DELETE_FAILED');})));
  count++;check(()=>assert(f.calls.some(c=>c.sql==='ROLLBACK'),kind+' failure rolls back before release'));check(()=>assert.equal(f.releases(),1));
}
{
 const bridge=createNativeRegistryPlatformAdapter({dialect:'mysql',connect:async()=>({query:async()=>({rows:'invalid'}),release(){},discard(){}})});
 const connection=await bridge.registryDb.getConnection();await connection.beginTransaction();
 await assert.rejects(connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',['x']),e=>e.code==='NATIVE_PLATFORM_RESULT_INVALID');count++;
 await connection.rollback();connection.release();
}
// Real existing JWT verification/request-token functions, AST-selected without
// importing platform startup or reading its secret. Only the key is synthetic.
const platformSource=fs.readFileSync(new URL('../server/platform.mjs',import.meta.url),'utf8');
const ast=createRequire(import.meta.url)('@babel/parser').parse(platformSource,{sourceType:'module'});
const declarations=['verifyJwt','requestToken'].map(name=>{const n=ast.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return platformSource.slice(n.start,n.end);}).join('\n');
const fixtureSecret=crypto.randomBytes(32).toString('hex');
const auth=Function('crypto','authSecret',declarations+';return {verifyJwt,requestToken};')(crypto,()=>fixtureSecret);
const jwt=claims=>{const prefix=[{alg:'HS256',typ:'JWT'},{email:identity.email,role:'free',aud:'crewcheck',exp:Math.floor(Date.now()/1000)+120,...claims}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return prefix+'.'+crypto.createHmac('sha256',fixtureSecret).update(prefix).digest('base64url');};
const bearer=jwt({});
async function invoke(handler,{method='GET',query='?installationId='+wire.installationId,headers={},body='',pathname=NATIVE_REGISTRY_PATH,requestPatch={},responsePatch={}}={}){
 const req=Readable.from([Buffer.isBuffer(body)?body:Buffer.from(body)]);req.method=method;req.headers={authorization:'Bearer '+bearer,...headers};
 Object.assign(req,requestPatch);
 const res={headers:{},status:null,body:null,setHeader(k,v){this.headers[k]=v;},writeHead(status,h){this.status=status;Object.assign(this.headers,h);},end(s){this.body=JSON.parse(s);}};
 Object.assign(res,responsePatch);
 const handled=await handler(req,res,new URL('https://synthetic.example.test'+pathname+query));return {handled,...res};
}
function hostFixture(overrides={}){
 const f=platformFixture(),protectionKey=crypto.randomBytes(32);let current=true;
 const options={enabled:true,admitIngress:()=>true,allowedOrigin:()=> 'https://synthetic.example.test',identityProvider:req=>{
   const claims=auth.verifyJwt(auth.requestToken(req));
   return claims?.email===identity.email&&claims.aud!=='crewcheck-visitor'&&claims.role!=='visitor'?{...identity,authenticated:true,role:'owner'}:null;
 },isIdentityCurrent:()=>current,admitRequest:()=>true,poolProvider:()=>f.db,protectionProvider:()=>({seal(token,context){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',protectionKey,iv);cipher.setAAD(Buffer.from(context));const bytes=Buffer.concat([cipher.update(token),cipher.final()]);return {format:'native-token-aes256gcm-v1',iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:bytes.toString('base64url')};}}),...overrides};
 return {...f,handler:createNativeRegistryAuthenticatedHandler(options),options,setCurrent:v=>current=v};
}
{
 const off=createNativeRegistryAuthenticatedHandler({identityProvider(){throw Error('OFF authority I/O');},poolProvider(){throw Error('OFF DB I/O');}});
 const res={writeHead(status){assert.equal(status,503);},end(body){assert.equal(JSON.parse(body).code,'NATIVE_REGISTRY_OFF');}};
 assert.equal(await off(new Proxy({},{get(){throw Error('OFF request read');}}),res,{pathname:NATIVE_REGISTRY_PATH}),true);count++;
 const f=hostFixture(),result=await invoke(f.handler);
 check(()=>assert.equal(result.status,200));check(()=>assert.equal(result.body.registryConfirmed,true));check(()=>assert.equal(result.body.revision,0));
 check(()=>assert.equal(result.headers['cache-control'],'no-store'));
 const post=await invoke(f.handler,{method:'POST',query:'',headers:{origin:'https://synthetic.example.test','content-type':'application/json'},body:JSON.stringify(wire)});
 check(()=>assert.equal(post.status,200));check(()=>assert.equal(post.body.mutationId,wire.mutationId));check(()=>assert.equal(post.body.received,null));check(()=>assert(!JSON.stringify(post.body).includes(wire.token)));
 check(()=>assert.equal(f.opens(),2));
}
for(const [input,status] of [
 [{headers:{authorization:'',cookie:'crewcheck_auth_token='+bearer,'x-crewcheck-email':identity.email}},401],
 [{headers:{authorization:'Bearer '+bearer+'forged'}},401],
 [{headers:{authorization:'Bearer '+jwt({exp:1})}},401],
 [{headers:{authorization:'Bearer '+jwt({aud:'crewcheck-visitor',role:'visitor'})}},401],
 [{headers:{origin:'https://other.example.test'}},403],
 [{query:'?installationId='+wire.installationId+'&installationId='+wire.installationId},400],
 [{query:'?installationId='+wire.installationId+'&ownerId=other'},400],
 [{method:'POST',query:'',headers:{'content-type':'application/json'},body:JSON.stringify(wire)},403],
 [{method:'POST',query:'',headers:{origin:'https://synthetic.example.test','content-type':'text/plain'},body:'{}'},415],
 [{method:'POST',query:'',headers:{origin:'https://synthetic.example.test','content-type':'application/json'},body:JSON.stringify({...wire,ownerId:'synthetic-other-owner'})},400],
 [{method:'POST',query:'',headers:{origin:'https://synthetic.example.test','content-type':'application/json'},body:Buffer.from([255])},400],
 [{method:'POST',query:'',headers:{origin:'https://synthetic.example.test','content-type':'application/json'},body:' '.repeat(16385)},413],
 ]){
 const f=hostFixture(),result=await invoke(f.handler,input);check(()=>assert.equal(result.status,status));check(()=>assert.equal(f.opens(),0,'rejection precedes DB I/O'));
 check(()=>assert(!JSON.stringify(result.body).includes(bearer)&&!JSON.stringify(result.body).includes(wire.token)));
}
for(const overrides of [{admitRequest:()=>false},{isIdentityCurrent:undefined},{allowedOrigin:()=>'*'},{poolProvider:()=>{throw Error(wire.token);}}]){
 const f=hostFixture(overrides),result=await invoke(f.handler);check(()=>assert(result.status>=400));check(()=>assert(!JSON.stringify(result.body).includes(wire.token)));
}
{
 let f;f=hostFixture({poolProvider:async()=>{f.setCurrent(false);return f.db;}});const result=await invoke(f.handler);
 check(()=>assert.equal(result.body.code,'NATIVE_IDENTITY_CHANGED'));check(()=>assert.equal(f.opens(),0,'scope replaced while awaiting pool cannot start transaction'));
 let fences=0;const late=hostFixture({isIdentityCurrent:()=>++fences<4}),reply=await invoke(late.handler);
 check(()=>assert.equal(reply.status,401));check(()=>assert.equal(reply.body.registryConfirmed,false,'late authority gets no receipt'));check(()=>assert.equal(late.opens(),1));
 const other=await invoke(hostFixture().handler,{pathname:'/synthetic-unrelated'});check(()=>assert.equal(other.handled,false));
}
const commonSource=fs.readFileSync(new URL('../server/v139/common.mjs',import.meta.url),'utf8');
const commonAst=createRequire(import.meta.url)('@babel/parser').parse(commonSource,{sourceType:'module'});
const commonFunctions=['secureCompare','safeEmail','verifyJwt','requestToken','requireExistingIdentity'].map(name=>{
 const n=commonAst.program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).find(n=>n?.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return commonSource.slice(n.start,n.end);
}).join('\n');
function existingIdentityFixture({claims={},profilePatch={},clock=()=>Date.now(),failRead=false,changeAt=Infinity,keyUnavailable=false,changeDbAt=Infinity}={}){
 const f=platformFixture();let authReads=0,poolReads=0;
 const raw={...f.native,query:async(sql,params)=>{
  authReads++;if(failRead)throw Error('SYNTHETIC_AUTH_DB_FAILURE');assert.equal(sql,'SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1');assert.deepEqual(params,[identity.email]);
  return [[{email:identity.email,public_id:authReads>=changeAt?'synthetic-recreated-owner':identity.ownerId,must_change_password:0,name:'SYNTHETIC_PRIVATE_PROFILE',...profilePatch}]];
 }};
 const identify=Function('crypto','authSecret','dbPool','sendJson','isAdminEmail',commonFunctions+';return requireExistingIdentity;')(crypto,()=>{if(keyUnavailable)throw Object.assign(Error('SYNTHETIC_KEY_UNAVAILABLE'),{status:503});return fixtureSecret;},async()=>++poolReads>=changeDbAt?{...raw}:raw,(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));},()=>false);
 const token=jwt({iss:'crewcheck',aud:'crewcheck-web',sub:identity.ownerId,mustChangePassword:false,...claims});
 const handler=createNativeRegistryExistingIdentityHandler({enabled:true,identify,admitIngress:()=>true,allowedOrigin:()=> 'https://synthetic.example.test',admitRequest:()=>true,clock});
 return {...f,handler,token,authReads:()=>authReads};
}
{
 let calls=0;const handler=createNativeRegistryExistingIdentityHandler({identify(){calls++;throw Error('OFF authority I/O');}});
 const result=await invoke(handler);check(()=>assert.equal(result.status,503));check(()=>assert.equal(calls,0,'existing-account composition OFF has no authority I/O'));
 const f=existingIdentityFixture(),reply=await invoke(f.handler,{headers:{authorization:'Bearer '+f.token,'x-crewcheck-email':'other@example.test'}});
 check(()=>assert.equal(reply.status,200));check(()=>assert.equal(reply.body.registryConfirmed,true));check(()=>assert.equal(f.opens(),1));
 check(()=>assert.equal(f.authReads(),5,'existing identity rechecked across awaits'));
 check(()=>assert(!JSON.stringify(reply.body).includes(f.token)&&!JSON.stringify(reply.body).includes('SYNTHETIC_PRIVATE_PROFILE')));
}
for(const options of [
 {claims:{iss:'other'}},{claims:{aud:'crewcheck-visitor',role:'visitor'}},{claims:{aud:'other'}},{claims:{exp:undefined}},
 {claims:{exp:String(Math.floor(Date.now()/1000)+120)}},{claims:{mustChangePassword:undefined}},{claims:{mustChangePassword:true}},
 {profilePatch:{public_id:'synthetic-recreated-owner'}},{profilePatch:{must_change_password:1}},{profilePatch:{must_change_password:'1'}},{profilePatch:{must_change_password:undefined}},
 ]){
 const f=existingIdentityFixture(options),reply=await invoke(f.handler,{headers:{authorization:'Bearer '+f.token}});
 check(()=>assert.equal(reply.status,401));check(()=>assert.equal(f.opens(),0,'invalid canonical authority cannot start registry transaction'));
}
for(const options of [{failRead:true},{keyUnavailable:true}]){
 const f=existingIdentityFixture(options),reply=await invoke(f.handler,{headers:{authorization:'Bearer '+f.token}});
 check(()=>assert.equal(reply.status,503,'authority outage is not presented as absent/invalid account'));check(()=>assert.equal(reply.body.registryConfirmed,false));
}
{
 const f=existingIdentityFixture({changeAt:5}),reply=await invoke(f.handler,{headers:{authorization:'Bearer '+f.token}});
 check(()=>assert.equal(reply.status,401));check(()=>assert.equal(reply.body.registryConfirmed,false));check(()=>assert.equal(f.opens(),1,'late recreation after SQL withholds receipt'));
 const expired=existingIdentityFixture({clock:()=>Date.now()+180000}),replyExpired=await invoke(expired.handler,{headers:{authorization:'Bearer '+expired.token}});
 check(()=>assert.equal(replyExpired.status,401));check(()=>assert.equal(expired.opens(),0));
}
for(const at of [4,5]){
 const f=existingIdentityFixture({changeDbAt:at}),reply=await invoke(f.handler,{headers:{authorization:'Bearer '+f.token}});
 check(()=>assert.equal(reply.status,401,'pool replacement cannot borrow prior authority'));
 check(()=>assert.equal(reply.body.registryConfirmed,false));check(()=>assert.equal(f.opens(),at===4?0:1));
}
for(const gate of [undefined,async()=>false,async()=>({allowed:true}),async()=>{throw Error('SYNTHETIC_INGRESS_UNAVAILABLE');}]){
 let authorityCalls=0,dbCalls=0;
 const handler=createNativeRegistryAuthenticatedHandler({enabled:true,admitIngress:gate,allowedOrigin:()=> 'https://synthetic.example.test',identityProvider:()=>{authorityCalls++;throw Error('SYNTHETIC_AUTH_MUST_NOT_RUN');},isIdentityCurrent:()=>true,admitRequest:()=>true,poolProvider:()=>{dbCalls++;throw Error('SYNTHETIC_DB_MUST_NOT_RUN');}});
 const reply=await invoke(handler);check(()=>assert(reply.status>=400));check(()=>assert.equal(authorityCalls,0,'ingress rejection precedes credential/identity work'));check(()=>assert.equal(dbCalls,0));
}
{
 const events=[];const f=hostFixture({admitIngress:async()=>{events.push('ingress');return true;},identityProvider:()=>{events.push('identity');return {...identity,authenticated:true,role:'owner'};},admitRequest:()=>{events.push('owner');return true;}});
 const reply=await invoke(f.handler);check(()=>assert.equal(reply.status,200));check(()=>assert.deepEqual(events,['ingress','identity','owner']));
 let authorityCalls=0;
 const h=createNativeRegistryExistingIdentityHandler({enabled:true,admitIngress:()=>false,admitRequest:()=>true,allowedOrigin:()=> 'https://synthetic.example.test',identify:()=>{authorityCalls++;throw Error('SYNTHETIC_NO_AUTH_WORK');}});
 const denied=await invoke(h);check(()=>assert.equal(denied.status,429));check(()=>assert.equal(denied.body.code,'NATIVE_INGRESS_LIMITED'));check(()=>assert.equal(authorityCalls,0));
}
{
 let authorities=0;
 const f=hostFixture({identityProvider:()=>{authorities++;return {...identity,authenticated:true,role:'owner'};}});
 const early=await invoke(f.handler,{requestPatch:{aborted:true}});
 check(()=>assert.equal(authorities,0,'already aborted request cannot reach authority'));check(()=>assert.equal(f.opens(),0));check(()=>assert.equal(early.status,null));
 const incomplete=await invoke(f.handler,{requestPatch:{destroyed:true,complete:false}});
 check(()=>assert.equal(incomplete.status,null));check(()=>assert.equal(f.opens(),0,'destroyed incomplete HTTP request starts no work'));
}
for(const responsePatch of [{destroyed:true},{writableEnded:true},{headersSent:true}]){
 const f=hostFixture(),reply=await invoke(f.handler,{responsePatch});check(()=>assert.equal(f.opens(),0));check(()=>assert.equal(reply.status,null,'closed response gets no second write'));
}
{
 let authorities=0;const f=hostFixture({admitIngress:req=>{req.aborted=true;return true;},identityProvider:()=>{authorities++;throw Error('AUTH_MUST_NOT_RUN');}});
 await invoke(f.handler);check(()=>assert.equal(authorities,0,'abort during ingress stops next stage'));check(()=>assert.equal(f.opens(),0));
 let request;const pending=hostFixture({identityProvider:req=>{request=req;return {...identity,authenticated:true,role:'owner'};},poolProvider:async()=>{request.aborted=true;return pending.db;}});
 const stopped=await invoke(pending.handler);check(()=>assert.equal(pending.opens(),0,'abort while resolving pool starts no SQL'));check(()=>assert.equal(stopped.status,null));
 let fences=0;const late=hostFixture({isIdentityCurrent:req=>{if(++fences===4)req.aborted=true;return true;}}),reply=await invoke(late.handler);
 check(()=>assert.equal(late.opens(),1));check(()=>assert.equal(reply.status,null,'abort after SQL does not create a receipt'));
}
for(const stage of ['headers','body']){
 let attempts=0;const f=hostFixture(),responsePatch=stage==='headers'?{writeHead(){attempts++;throw Error('SYNTHETIC_WRITE_FAILED');}}:{end(){attempts++;throw Error('SYNTHETIC_END_FAILED');}};
 await assert.doesNotReject(invoke(f.handler,{responsePatch}));count++;
 check(()=>assert.equal(attempts,1,'response I/O failure is not retried'));
}
{
 const f=hostFixture(),reply=await invoke(f.handler,{method:'POST',query:'',requestPatch:{complete:true},headers:{origin:'https://synthetic.example.test','content-type':'application/json'},body:JSON.stringify(wire)});
 check(()=>assert.equal(reply.status,200,'completed body is not an aborted HTTP request'));check(()=>assert.equal(reply.body.registryConfirmed,true));
 let writes=0;await assert.doesNotReject(invoke(createNativeRegistryAuthenticatedHandler(),{responsePatch:{end(){writes++;throw Error('SYNTHETIC_OFF_RESPONSE_FAILURE');}}}));count++;
 check(()=>assert.equal(writes,1,'OFF response failure is not retried'));
}
console.log('PASS '+count+' native protocol wire/CAS/ACK/cancellation/existing-owner/authenticated-host/platform-transaction/revoke/OFF synthetic checks');
