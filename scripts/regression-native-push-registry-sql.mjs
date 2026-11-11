import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import mysql from 'mysql2/promise';
import {mutateNativeInstallation,readNativeInstallation,deleteNativeAccountWithRegistry,nativeBindingKey,NATIVE_PROJECT,NATIVE_PACKAGE,createNativeRegistryPlatformAdapter} from '../server/native-push/registry.mjs';
import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {applyNativeProtocolMutation,readNativeProtocolInstallation,createNativeRegistryAuthenticatedHandler,createNativeRegistryExistingIdentityHandler,NATIVE_REGISTRY_PATH} from '../server/native-push/protocol-adapter.mjs';

const value=process.env.NATIVE_PUSH_TEST_MYSQL_URL;
const url=new URL(value||'mysql://invalid/');
const verifyClientOnly=process.argv.includes('--verify-client-source-only');
if(!verifyClientOnly){
assert.equal(process.env.NATIVE_PUSH_SQL_DISPOSABLE,'1','explicit disposable fixture only');
assert(['127.0.0.1','localhost'].includes(url.hostname),'no production/external database');
assert(/^\/crewcheck_native_fixture_[a-z0-9_]+$/.test(url.pathname),'dedicated test database only');
assert.equal(decodeURIComponent(url.username),'native_fixture','dedicated synthetic user only');
}
// Read-only #1218 source snapshot, never copied into product/runtime modules.
const clientSourcePath=process.env.NATIVE_CLIENT_PROTOCOL_SOURCE,clientManifestPath=process.env.NATIVE_CLIENT_PROTOCOL_MANIFEST;
assert(clientSourcePath&&path.isAbsolute(clientSourcePath)&&clientManifestPath&&path.isAbsolute(clientManifestPath),'verified pinned client snapshot required');
const clientSource=fs.readFileSync(clientSourcePath),clientManifest=JSON.parse(fs.readFileSync(clientManifestPath,'utf8'));
assert(/^[a-f0-9]{40}$/.test(process.env.NATIVE_CLIENT_PROTOCOL_REF||''));
assert.equal(clientManifest.commit,process.env.NATIVE_CLIENT_PROTOCOL_REF);assert.equal(clientManifest.sourcePath,'client/src/lib/androidPushLifecycle.ts');
assert.equal(clientManifest.sizeBytes,clientSource.length);assert.equal(clientManifest.sha256,crypto.createHash('sha256').update(clientSource).digest('hex'));
assert.equal(clientManifest.gitBlob,crypto.createHash('sha1').update(Buffer.from('blob '+clientSource.length+'\0')).update(clientSource).digest('hex'));
const clientJS=ts.transpileModule(clientSource.toString('utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {createAndroidRegistryProtocol,createAndroidPushLifecycle}=await import('data:text/javascript;base64,'+Buffer.from(clientJS).toString('base64'));
assert.equal(typeof createAndroidRegistryProtocol,'function');assert.equal(typeof createAndroidPushLifecycle,'function');
if(verifyClientOnly){console.log(JSON.stringify({verifiedClientSource:true,clientCommit:clientManifest.commit,gitBlob:clientManifest.gitBlob,sha256:clientManifest.sha256,sqlExecuted:false}));process.exit(0);}
let db=mysql.createPool({uri:value,connectionLimit:8});
const fixtureKey=crypto.randomBytes(32);
const clientAuthKey=crypto.randomBytes(32);
const protection={seal(token,context){
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',fixtureKey,iv);
 cipher.setAAD(Buffer.from(context));
 const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return {format:'native-token-aes256gcm-v1',iv:iv.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')};
}};
const owners=['alpha','bravo','charlie','delta'].map(name=>({ownerId:'synthetic-native-'+name,email:'native-'+name+'@example.test'}));
const token='SYNTHETIC_FCM_TOKEN_NOT_REAL_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let seq=0,checks=0;const assertCheck=(v,label)=>{assert(v,label);checks++};
const input=(owner=owners[0],overrides={})=>({identity:owner,installationId:'synthetic-install-'+owner.ownerId,mutationId:'synthetic-operation-'+(++seq),project:NATIVE_PROJECT,package:NATIVE_PACKAGE,action:'register',expectedRevision:0,expectedConsentRevision:0,generation:1,tokenRevision:1,consent:true,token,...overrides});
const mutate=(v,extra={})=>mutateNativeInstallation(db,v,{protection,now:1700000000000,...extra});
try {
 await db.query('DROP TABLE IF EXISTS crewcheck_telegram_state');
 await db.query('DROP TABLE IF EXISTS crewcheck_platform_profiles');
 await db.query('CREATE TABLE crewcheck_platform_profiles (email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(160) NOT NULL,must_change_password BOOLEAN NOT NULL DEFAULT FALSE) ENGINE=InnoDB');
 await db.query('CREATE TABLE crewcheck_telegram_state (state_key VARCHAR(190) PRIMARY KEY,payload LONGTEXT NOT NULL,updated_at DATETIME(3) NOT NULL) ENGINE=InnoDB');
 for(const owner of owners)await db.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES(?,?)',[owner.email,owner.ownerId]);
 const initial=input();const first=await mutate(initial);
 assertCheck(first.revision===1&&first.consentRevision===1&&first.active,'initial register');
 const initialKey=nativeBindingKey(initial.identity,initial.installationId);
 const storedInitial=(await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[initialKey]))[0][0].payload;
 const initialClaims=(await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-native-push:token:%'"))[0];
 const initialClaim=initialClaims.find(row=>JSON.parse(row.payload)?.bindingKey===initialKey);assert(initialClaim);
 for(const malformed of [false,0,'']) {
   await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(malformed),initialKey]);
   await assert.rejects(readNativeInstallation(db,owners[0],initial.installationId),e=>e.code==='NATIVE_REGISTRY_STATE_INVALID');checks++;
   await assert.rejects(mutate(initial),e=>e.code==='NATIVE_REGISTRY_STATE_INVALID');checks++;
   await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[storedInitial,initialKey]);
   await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[JSON.stringify(malformed),initialClaim.state_key]);
   await assert.rejects(mutate(input(owners[1])),e=>e.code==='NATIVE_REGISTRY_STATE_INVALID');checks++;
   await db.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?',[initialClaim.payload,initialClaim.state_key]);
 }
 await assert.rejects(mutate(input(owners[0],{expectedRevision:1,expectedConsentRevision:1,token:token+'SAME_VERSION_CHANGED'})),e=>e.code==='NATIVE_TOKEN_VERSION_REUSED');checks++;

 const duplicate=await mutate(initial);assertCheck(duplicate.duplicate&&duplicate.revision===1,'same mutation reconciles without revision bump');
 assertCheck(!JSON.stringify(await readNativeInstallation(db,owners[0],initial.installationId)).includes('sealed'),'GET is redacted');
 await assert.rejects(mutate({...initial,token:token+'CHANGED'}),e=>e.code==='NATIVE_MUTATION_REUSED');checks++;
 await assert.rejects(mutate(input(owners[1])),e=>e.code==='NATIVE_TOKEN_ALREADY_BOUND');checks++;
 const rotation=input(owners[0],{action:'rotate',consent:false,expectedRevision:1,expectedConsentRevision:1,tokenRevision:2,token:token+'ROTATED'});
 const rotated=await mutate(rotation);assertCheck(rotated.revision===2&&rotated.consentRevision===1,'rotation retains existing consent');
 await assert.rejects(mutate(input(owners[0],{expectedRevision:1,expectedConsentRevision:1})),e=>e.code==='NATIVE_REVISION_CHANGED');checks++;
 const revoked=await mutate(input(owners[0],{action:'revoke',expectedRevision:2,expectedConsentRevision:1,tokenRevision:2}));
 assertCheck(!revoked.active&&revoked.revision===3&&revoked.consentRevision===2,'revoke commits tombstone');
 await assert.rejects(mutate(input(owners[0],{expectedRevision:3,expectedConsentRevision:2,tokenRevision:99})),e=>e.code==='NATIVE_GENERATION_REVOKED');checks++;
 const replacement=input(owners[1],{token:token+'ROTATED'});
 const bound=await mutate(replacement);assertCheck(bound.active,'different owner can bind only after confirmed old revocation');
 await assert.rejects(mutate(input(owners[0],{expectedRevision:3,expectedConsentRevision:2,tokenRevision:100,token:token+'ROTATED'})),e=>e.code==='NATIVE_GENERATION_REVOKED');checks++;
 await assert.rejects(deleteNativeAccountWithRegistry(db,owners[1],async()=>{}),e=>e.code==='NATIVE_ACCOUNT_DELETION_NOT_CONFIRMED');checks++;
 assertCheck((await readNativeInstallation(db,owners[1],replacement.installationId)).active,'unconfirmed delete rolls all registry changes back');
 await assert.rejects(deleteNativeAccountWithRegistry(db,owners[1],async()=>{throw Error('SYNTHETIC_DELETE_FAILURE')}),/SYNTHETIC_DELETE_FAILURE/);checks++;
 assertCheck((await readNativeInstallation(db,owners[1],replacement.installationId)).active,'failed canonical delete preserves registry transaction');
 const deleted=await deleteNativeAccountWithRegistry(db,owners[1],async connection=>{await connection.query('DELETE FROM crewcheck_platform_profiles WHERE email=?',[owners[1].email]);});
 assertCheck(deleted.registryDeleted===1,'canonical deletion and registry erasure commit atomically');
 await assert.rejects(mutate(input(owners[1],{generation:2})),e=>e.code==='NATIVE_SESSION_REVOKED');checks++;
 // Independent owners race for one opaque token. At most one active binding.
 const racers=[input(owners[2],{token:token+'RACE'}),input(owners[3],{token:token+'RACE'})];
 const race=await Promise.allSettled(racers.map(v=>mutate(v)));
 assertCheck(race.filter(r=>r.status==='fulfilled').length===1,'one token race winner');
 assertCheck(race.filter(r=>r.status==='rejected').every(r=>['NATIVE_TOKEN_ALREADY_BOUND','ER_LOCK_DEADLOCK'].includes(r.reason.code)),'race loser fails closed');
 const winner=race.findIndex(r=>r.status==='fulfilled'),winnerInput=racers[winner];
 const winnerKey=nativeBindingKey(winnerInput.identity,winnerInput.installationId);
 const [claimRows]=await db.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-native-push:token:%'");
 const winnerClaim=claimRows.find(row=>JSON.parse(row.payload)?.bindingKey===winnerKey);
 assert(winnerClaim);
 await db.query('DELETE FROM crewcheck_telegram_state WHERE state_key=?',[winnerClaim.state_key]);
 await assert.rejects(readNativeInstallation(db,winnerInput.identity,winnerInput.installationId),e=>e.code==='NATIVE_TOKEN_CLAIM_CHANGED');checks++;
 await assert.rejects(mutate(winnerInput),e=>e.code==='NATIVE_TOKEN_CLAIM_CHANGED');checks++;
 await db.query('INSERT INTO crewcheck_telegram_state(state_key,payload,updated_at) VALUES(?,?,NOW(3))',[winnerClaim.state_key,winnerClaim.payload]);

 // Lost commit acknowledgement: do not call it confirmed, reconcile by mutation ID.
 const uncertain=input(owners[0],{generation:2,expectedRevision:3,expectedConsentRevision:2,token:token+'UNCERTAIN'});
 const lostAckPool={async getConnection(){const c=await db.getConnection();return {query:c.query.bind(c),beginTransaction:c.beginTransaction.bind(c),rollback:c.rollback.bind(c),release:c.release.bind(c),async commit(){await c.commit();throw Error('SYNTHETIC_COMMIT_ACK_LOST')}};}};
 await assert.rejects(mutateNativeInstallation(lostAckPool,uncertain,{protection,now:1700000000100}),/SYNTHETIC_COMMIT_ACK_LOST/);checks++;
 assertCheck((await mutate(uncertain)).duplicate,'unknown commit reconciles as duplicate, no blind state replay');
 const [rows]=await db.query('SELECT payload FROM crewcheck_telegram_state');
 assertCheck(rows.every(row=>!String(row.payload).includes('SYNTHETIC_FCM_TOKEN')),'SQL never stores token plaintext');
 const current=(await db.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?',[nativeBindingKey(uncertain.identity,uncertain.installationId)]))[0][0];
 const binding=JSON.parse(current.payload),sealed=binding.sealedToken;
 const aad=JSON.stringify([NATIVE_PROJECT,NATIVE_PACKAGE,binding.ownerId,binding.installationId,binding.revision,binding.generation,binding.tokenRevision,binding.consentRevision]);
 const decipher=crypto.createDecipheriv('aes-256-gcm',fixtureKey,Buffer.from(sealed.iv,'base64url'));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(Buffer.from(sealed.tag,'base64url'));
 assertCheck(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,'base64url')),decipher.final()]).toString()===uncertain.token,'synthetic protection roundtrip bound to generation/revision');
 await db.end();db=mysql.createPool({uri:value,connectionLimit:4});
 assertCheck((await readNativeInstallation(db,winnerInput.identity,winnerInput.installationId)).active,'registry survives process/pool restart');
 const failInput=input(owners[0],{generation:3,expectedRevision:4,expectedConsentRevision:3,token:token+'PROTECTION'});
 await assert.rejects(mutate(failInput,{protection:undefined}),e=>e.code==='NATIVE_PROTECTION_REQUIRED');checks++;
 await assert.rejects(mutate(failInput,{protection:{seal(){throw Error(token)}}}),e=>e.code==='NATIVE_PROTECTION_FAILED'&&!e.message.includes(token));checks++;
 assertCheck((await readNativeInstallation(db,owners[0],uncertain.installationId)).revision===4,'protection failure rolls back');
 // Real SQL through the actual wire adapter: an uncertain commit must not ACK
 // or retry; replaying the retained mutation ID reconciles the durable result.
 const protocolWire={action:'register',projectId:NATIVE_PROJECT,package:NATIVE_PACKAGE,installationId:'synthetic-protocol-install',mutationId:'synthetic-protocol-register',expectedRevision:0,expectedConsentRevision:0,generation:'1',tokenRevision:'1',consent:true,token:token+'PROTOCOL'};
 const emptyProtocol=await readNativeProtocolInstallation(db,owners[0],protocolWire.installationId);
 assertCheck(emptyProtocol.revision===0&&!emptyProtocol.registered&&!('generation' in emptyProtocol),'wire GET gives initial CAS without inventing native version');
 await assert.rejects(applyNativeProtocolMutation(lostAckPool,owners[0],protocolWire,{protection,now:1700000000200}),/SYNTHETIC_COMMIT_ACK_LOST/);checks++;
 const protocolAck=await applyNativeProtocolMutation(db,owners[0],protocolWire,{protection,now:1700000000300});
 assertCheck(protocolAck.registered&&protocolAck.duplicate&&protocolAck.revision===1&&protocolAck.received===null,'wire lost ACK reconciles once without claiming delivery');
 const protocolRead=await readNativeProtocolInstallation(db,owners[0],protocolWire.installationId);
 assertCheck(protocolRead.registered&&protocolRead.revision===1&&!JSON.stringify(protocolRead).includes('SYNTHETIC_FCM_TOKEN')&&!('sealedToken' in protocolRead),'wire GET returns redacted current CAS');
 await assert.rejects(applyNativeProtocolMutation(db,owners[0],{...protocolWire,token:token+'DIFFERENT'},{protection}),e=>e.code==='NATIVE_MUTATION_REUSED');checks++;
 const protocolRevoke={...protocolWire,action:'revoke',consent:false,token:undefined,mutationId:'synthetic-protocol-revoke',expectedRevision:1,expectedConsentRevision:1};
 const revokedAck=await applyNativeProtocolMutation(db,owners[0],protocolRevoke,{});
 assertCheck(revokedAck.revoked&&!revokedAck.registered&&revokedAck.revision===2,'wire revoke commits before correlated ACK');
 assertCheck(!(await readNativeProtocolInstallation(db,owners[0],protocolWire.installationId)).registered,'wire GET reports committed revocation');
 await assert.rejects(applyNativeProtocolMutation(db,owners[0],{...protocolWire,mutationId:'synthetic-protocol-stale',expectedRevision:2,expectedConsentRevision:2},{protection}),e=>e.code==='NATIVE_GENERATION_REVOKED');checks++;
 // Real production platform adapter → isolated native bridge → actual MySQL.
 const platformOwner={ownerId:'synthetic-native-platform',email:'native-platform@example.test'};
 await db.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES(?,?)',[platformOwner.email,platformOwner.ownerId]);
 let platformOpens=0,lastThreadId;
 const platformPool={getConnection:async()=>{platformOpens++;const c=await db.getConnection();lastThreadId=c.threadId;return c;}};
 const platformBridge=createNativeRegistryPlatformAdapter(mysqlAdapter(platformPool));
 const platformWire={...protocolWire,installationId:'synthetic-platform-install',mutationId:'synthetic-platform-register',token:token+'PLATFORM'};
 const platformAck=await applyNativeProtocolMutation(platformBridge.registryDb,platformOwner,platformWire,{protection});
 assertCheck(platformAck.registered&&platformAck.revision===1,'actual platform result/parameter adapter registers');
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId)).registered,'actual platform adapter reads redacted state');
 await assert.rejects(deleteNativeAccountWithRegistry(platformBridge.registryDb,platformOwner,platformBridge.canonicalDeletion(async client=>{
   await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[platformOwner.email]);
   throw Error('SYNTHETIC_PLATFORM_DELETE_FAILURE');
 })),/SYNTHETIC_PLATFORM_DELETE_FAILURE/);checks++;
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId)).registered,'callback failure restores binding and token claim');
 assertCheck((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[platformOwner.email]))[0].length===1,'callback failure restores canonical profile on same transaction');
 await assert.rejects(deleteNativeAccountWithRegistry(platformBridge.registryDb,platformOwner,platformBridge.canonicalDeletion(async()=>{})),e=>e.code==='NATIVE_ACCOUNT_DELETION_NOT_CONFIRMED');checks++;
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId)).registered,'unconfirmed deletion preserves binding');
 let taintedReleases=0,taintedDiscards=0;
 const taintedPool={getConnection:async()=>{
   const c=await db.getConnection();return {query:async(sql,params)=>{if(sql==='ROLLBACK')throw Error('SYNTHETIC_PLATFORM_ROLLBACK_FAILED');return c.query(sql,params);},release:()=>{taintedReleases++;c.release();},destroy:()=>{taintedDiscards++;c.destroy();}};
 }};
 const taintedBridge=createNativeRegistryPlatformAdapter(mysqlAdapter(taintedPool));
 await assert.rejects(deleteNativeAccountWithRegistry(taintedBridge.registryDb,platformOwner,taintedBridge.canonicalDeletion(async client=>{
   await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[platformOwner.email]);throw Error('SYNTHETIC_DELETE_FAILED');
 })),/SYNTHETIC_PLATFORM_ROLLBACK_FAILED/);checks++;
 assertCheck(taintedReleases===0&&taintedDiscards===1,'failed rollback destroys actual connection without returning it to pool');
 assertCheck((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[platformOwner.email]))[0].length===1,'destroyed uncommitted connection leaves canonical profile intact');
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId)).registered,'destroyed uncommitted connection leaves binding/claim intact');
 const uncertainPlatformPool={getConnection:async()=>{
   const c=await db.getConnection();return {query:async(sql,params)=>{const result=await c.query(sql,params);if(sql==='COMMIT')throw Error('SYNTHETIC_PLATFORM_ACK_LOST');return result;},release:()=>c.release(),destroy:()=>c.destroy()};
 }};
 const uncertainPlatform=createNativeRegistryPlatformAdapter(mysqlAdapter(uncertainPlatformPool));
 const platformRotate={...platformWire,action:'rotate',consent:false,expectedRevision:1,expectedConsentRevision:1,tokenRevision:'2',mutationId:'synthetic-platform-rotate',token:token+'PLATFORM_ROTATED'};
 await assert.rejects(applyNativeProtocolMutation(uncertainPlatform.registryDb,platformOwner,platformRotate,{protection}),/SYNTHETIC_PLATFORM_ACK_LOST/);checks++;
 const reconciled=await applyNativeProtocolMutation(platformBridge.registryDb,platformOwner,platformRotate,{protection});
 assertCheck(reconciled.duplicate&&reconciled.revision===2,'platform commit uncertainty reconciles fixed ID without new mutation');
 const hostOptions={enabled:true,admitIngress:()=>true,allowedOrigin:()=> 'https://synthetic.example.test',identityProvider:()=>({...platformOwner,authenticated:true,role:'owner'}),isIdentityCurrent:()=>true,admitRequest:()=>true,poolProvider:()=>mysqlAdapter(platformPool),protectionProvider:()=>protection};
 async function invokeHost(handler,{method='GET',body,query='?installationId='+platformWire.installationId}={}){
   const req=Readable.from([Buffer.from(body?JSON.stringify(body):'')]);req.method=method;req.headers={authorization:'Bearer SYNTHETIC_HOST_AUTH_NOT_REAL',origin:'https://synthetic.example.test','content-type':'application/json'};
   const res={status:0,value:null,writeHead(status){this.status=status;},end(value){this.value=JSON.parse(value);},setHeader(){}};
   assert.equal(await handler(req,res,new URL('https://synthetic.example.test'+NATIVE_REGISTRY_PATH+query)),true);return res;
 }
 const host=createNativeRegistryAuthenticatedHandler(hostOptions),hostRead=await invokeHost(host);
 assertCheck(hostRead.status===200&&hostRead.value.registryConfirmed&&hostRead.value.revision===2,'unmounted authenticated host composes actual platform SQL read');
 const ingressOpensBefore=platformOpens;let ingressAuthCalls=0;
 const blockedIngress=createNativeRegistryAuthenticatedHandler({...hostOptions,admitIngress:()=>false,identityProvider:()=>{ingressAuthCalls++;throw Error('SYNTHETIC_AUTH_MUST_NOT_RUN');}});
 const blockedIngressReply=await invokeHost(blockedIngress);
 assertCheck(blockedIngressReply.status===429&&blockedIngressReply.value.code==='NATIVE_INGRESS_LIMITED','ingress refuses before protected authority work');
 assertCheck(ingressAuthCalls===0&&platformOpens===ingressOpensBefore,'ingress refusal performs no identity or registry SQL work');
 let fenceCalls=0;
 const lateHost=createNativeRegistryAuthenticatedHandler({...hostOptions,isIdentityCurrent:()=>++fenceCalls<4});
 const hostRotate={...platformRotate,expectedRevision:2,mutationId:'synthetic-host-rotate',tokenRevision:'3',token:token+'HOST_ROTATED'};
 const lateReply=await invokeHost(lateHost,{method:'POST',query:'',body:hostRotate});
 assertCheck(lateReply.status===401&&!lateReply.value.registryConfirmed&&lateReply.value.received===null,'late identity change receives no committed mutation ACK');
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId)).revision===3,'late response is not misrepresented as no durable write');
 const duplicateReply=await invokeHost(host,{method:'POST',query:'',body:hostRotate});
 assertCheck(duplicateReply.status===200&&duplicateReply.value.duplicate&&duplicateReply.value.revision===3,'host fixed-ID reconcile returns exactly the existing committed receipt');
 assertCheck(!JSON.stringify(duplicateReply.value).includes(hostRotate.token),'host receipt redacts token');
 const deniedHost=createNativeRegistryAuthenticatedHandler({...hostOptions,identityProvider:()=>({...platformOwner,ownerId:'synthetic-unmatched-owner',authenticated:true,role:'owner'})});
 const deniedReply=await invokeHost(deniedHost);assertCheck(deniedReply.status===401&&deniedReply.value.code==='NATIVE_SESSION_REVOKED','canonical profile mismatch blocks host state read');
 let existingReads=0;
 const existingHost=createNativeRegistryExistingIdentityHandler({enabled:true,allowedOrigin:hostOptions.allowedOrigin,admitIngress:hostOptions.admitIngress,admitRequest:()=>true,protectionProvider:()=>protection,
   identify:async(_req,sink)=>{
     existingReads++;const [rows]=await db.query('SELECT * FROM crewcheck_platform_profiles WHERE email=? LIMIT 1',[platformOwner.email]);
     if(!rows.length){sink.writeHead(401);sink.end('{}');return null;}
     return {db,email:platformOwner.email,profile:rows[0],payload:{iss:'crewcheck',aud:'crewcheck-web',sub:platformOwner.ownerId,email:platformOwner.email,role:'free',mustChangePassword:false,exp:Math.floor(Date.now()/1000)+120}};
   }});
 const existingReply=await invokeHost(existingHost);assertCheck(existingReply.status===200&&existingReply.value.revision===3,'existing-owner context composes actual pool and registry');
 assertCheck(existingReads===5,'existing-owner authority refreshed across all async boundaries');
 await db.query('UPDATE crewcheck_platform_profiles SET must_change_password=TRUE WHERE email=?',[platformOwner.email]);
 const passwordReply=await invokeHost(existingHost);assertCheck(passwordReply.status===401&&!passwordReply.value.registryConfirmed,'current password-change requirement overrides stale JWT flag');
 await db.query('UPDATE crewcheck_platform_profiles SET must_change_password=FALSE,public_id=? WHERE email=?',['synthetic-recreated-profile',platformOwner.email]);
 const recreatedReply=await invokeHost(existingHost);assertCheck(recreatedReply.status===401&&!recreatedReply.value.registryConfirmed,'recreated profile cannot inherit old native identity');
 await db.query('UPDATE crewcheck_platform_profiles SET public_id=? WHERE email=?',[platformOwner.ownerId,platformOwner.email]);
 const opensBeforeDelete=platformOpens;
 const platformDeleted=await deleteNativeAccountWithRegistry(platformBridge.registryDb,platformOwner,platformBridge.canonicalDeletion(async client=>{
   const result=await client.query('SELECT CONNECTION_ID() AS connectionId');
   assertCheck(Number(result.rows[0].connectionId)===lastThreadId,'canonical callback uses exact registry MySQL connection');
   await client.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[platformOwner.email]);
 }));
 assertCheck(platformOpens===opensBeforeDelete+1,'canonical deletion acquires only one connection');
 assertCheck(platformDeleted.registryDeleted===1&&platformDeleted.registryConfirmed,'canonical and native deletion confirm together');
 await assert.rejects(readNativeProtocolInstallation(platformBridge.registryDb,platformOwner,platformWire.installationId),e=>e.code==='NATIVE_SESSION_REVOKED');checks++;
 const erasedReply=await invokeHost(existingHost);assertCheck(erasedReply.status===401&&!erasedReply.value.registryConfirmed,'deleted existing identity is not recreated');
 assertCheck((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[platformOwner.email]))[0].length===0,'authority read creates no replacement profile');
 // Pinned real client → actual existing-account/JWT helper → host → platform
 // adapter → real SQL. Only socket transport, native device and Web Locks are
 // simulated. This does not execute or integrate the Android branch itself.
 const clientOwners=['alpha','bravo'].map(tag=>({ownerId:'synthetic-client-'+tag,email:'client-'+tag+'@example.test'}));
 for(const owner of clientOwners)await db.query('INSERT INTO crewcheck_platform_profiles(email,public_id) VALUES(?,?)',[owner.email,owner.ownerId]);
 const commonSource=fs.readFileSync(new URL('../server/v139/common.mjs',import.meta.url),'utf8');
 const commonAst=createRequire(import.meta.url)('@babel/parser').parse(commonSource,{sourceType:'module'});
 const commonCode=['secureCompare','safeEmail','verifyJwt','requestToken','requireExistingIdentity'].map(name=>{const n=commonAst.program.body.map(n=>n.type==='ExportNamedDeclaration'?n.declaration:n).find(n=>n?.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return commonSource.slice(n.start,n.end);}).join('\n');
 const identifyClient=Function('crypto','authSecret','dbPool','sendJson','isAdminEmail',commonCode+';return requireExistingIdentity;')(crypto,()=>clientAuthKey,async()=>db,(res,status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));},()=>false);
 const signClient=owner=>{const prefix=[{alg:'HS256',typ:'JWT'},{iss:'crewcheck',aud:'crewcheck-web',sub:owner.ownerId,email:owner.email,role:'free',mustChangePassword:false,exp:Math.floor(Date.now()/1000)+300}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return prefix+'.'+crypto.createHmac('sha256',clientAuthKey).update(prefix).digest('base64url');};
 const clientIdentities=clientOwners.map(owner=>({ownerId:owner.ownerId,session:signClient(owner)}));
 const clientHost=createNativeRegistryExistingIdentityHandler({enabled:true,identify:identifyClient,admitIngress:()=>true,admitRequest:()=>true,allowedOrigin:hostOptions.allowedOrigin,protectionProvider:()=>protection});
 const journal=new Map(),locks=new Map(),clientRequests=[];let currentClient=clientIdentities[0],clientSeq=0,loseClientAck=false,failClientRevoke=false;
 const snapshot=(owner=currentClient,overrides={})=>({enabled:true,ownerId:owner.ownerId,installationId:'synthetic-client-install',generation:'1',tokenRevision:'1',token:'SYNTHETIC_CLIENT_FCM_TOKEN_NOT_REAL_A',...overrides});
 const requestClient=async(identity,method,installationId,body)=>{
   clientRequests.push({ownerId:identity.ownerId,method,action:body?.action,mutationId:body?.mutationId});
   if(failClientRevoke&&body?.action==='revoke')throw Error('SYNTHETIC_REVOKE_TRANSPORT_UNAVAILABLE');
   const req=Readable.from([Buffer.from(body?JSON.stringify(body):'')]);req.method=method;req.headers={authorization:'Bearer '+identity.session,origin:'https://synthetic.example.test','content-type':'application/json'};
   const res={status:0,value:null,writeHead(status){this.status=status;},end(value){this.value=JSON.parse(value);},setHeader(){}};
   await clientHost(req,res,new URL('https://synthetic.example.test'+NATIVE_REGISTRY_PATH+(method==='GET'?'?installationId='+installationId:'')));
   if(res.status!==200)throw Object.assign(Error('SYNTHETIC_HTTP_UNCONFIRMED'),{status:res.status,code:res.value?.code});
   if(loseClientAck&&method==='POST'){loseClientAck=false;throw Error('SYNTHETIC_CLIENT_ACK_LOST');}
   return res.value;
 };
 const makeClient=()=>createAndroidRegistryProtocol({current:identity=>currentClient?.ownerId===identity.ownerId&&currentClient?.session===identity.session,
   lock:async(id,run)=>{const prior=locks.get(id)||Promise.resolve();let release;const gate=new Promise(resolve=>release=resolve),queued=prior.then(()=>gate);locks.set(id,queued);await prior;try{return await run();}finally{release();if(locks.get(id)===queued)locks.delete(id);}},
   journal:{read:key=>journal.get(key)||null,write:(key,value)=>journal.set(key,structuredClone(value)),remove:key=>journal.delete(key)},mutationId:()=> 'synthetic-client-operation-'+(++clientSeq),request:requestClient});
 let client=makeClient();const clientSnapshot=snapshot();
 assertCheck(!(await client.register(clientSnapshot,currentClient,false)).registered,'real client does not turn absent consent into registration');
 assertCheck(clientRequests.every(r=>r.method==='GET'),'no client POST without explicit consent');
 assertCheck((await client.register(clientSnapshot,currentClient,true)).registered,'real client registers through real JWT/host/SQL');
 const firstClient=await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[0],clientSnapshot.installationId);
 assertCheck(firstClient.revision===1&&firstClient.consentRevision===1,'real client ACK corresponds to durable SQL revision');
 const postsBefore=clientRequests.filter(r=>r.method==='POST').length;
 await client.register(clientSnapshot,currentClient,false);
 assertCheck(clientRequests.filter(r=>r.method==='POST').length===postsBefore,'unchanged confirmed client registration performs no duplicate mutation');
 const rotatedSnapshot=snapshot(currentClient,{tokenRevision:'2',token:'SYNTHETIC_CLIENT_FCM_TOKEN_NOT_REAL_ROTATED'});
 assertCheck((await client.register(rotatedSnapshot,currentClient,false)).registered,'real client rotates without inventing new consent');
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[0],clientSnapshot.installationId)).consentRevision===1,'real client rotation preserves consent revision');
 const uncertainSnapshot=snapshot(currentClient,{tokenRevision:'3',token:'SYNTHETIC_CLIENT_FCM_TOKEN_NOT_REAL_UNCERTAIN'});loseClientAck=true;
 await assert.rejects(client.register(uncertainSnapshot,currentClient,false));checks++;
 assertCheck(journal.size===1,'real client retains pending operation after actual committed SQL response loss');
 const journalText=JSON.stringify([...journal.values()]);
 assertCheck(!journalText.includes('SYNTHETIC_CLIENT_FCM_TOKEN')&&!clientIdentities.some(i=>journalText.includes(i.session)),'client durable metadata contains neither token nor bearer');
 client=makeClient();assertCheck((await client.register(uncertainSnapshot,currentClient,false)).registered,'new client instance reconciles prior mutation after restart');
 const clientAfterRestart=await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[0],clientSnapshot.installationId);
 assertCheck(clientAfterRestart.revision===3&&journal.size===0,'lost response/restart does not duplicate SQL revision');
 const uncertainPosts=clientRequests.filter(r=>r.method==='POST').slice(-2);
 assertCheck(uncertainPosts[0].mutationId===uncertainPosts[1].mutationId,'real client preserves exact mutation ID during uncertainty');
 await client.revoke(uncertainSnapshot,currentClient);
 assertCheck(!(await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[0],clientSnapshot.installationId)).registered,'real client revocation commits tombstone');
 // Actual lifecycle must retain the captured old session while revoke is held.
 const lifecycleProtocol=makeClient(),sessionChanges=[];let nativeGeneration=1,nativeSnapshot=snapshot(currentClient,{installationId:'synthetic-lifecycle-install',ownerId:'',token:'SYNTHETIC_CLIENT_FCM_TOKEN_NOT_REAL_LIFE_A'});
 const lifecycle=createAndroidPushLifecycle({target:new EventTarget(),identity:()=>currentClient,host:()=>({nativePushStatus:()=>JSON.stringify(nativeSnapshot),setNativePushSession:ownerId=>{sessionChanges.push(ownerId);nativeSnapshot={...nativeSnapshot,ownerId,generation:String(++nativeGeneration),token:ownerId?'SYNTHETIC_CLIENT_FCM_TOKEN_NOT_REAL_LIFE_'+ownerId:undefined};return true;},requestNativePushToken:()=>true}),register:(s,i,c)=>lifecycleProtocol.register(s,i,c),revoke:async(s,i)=>{await lifecycleProtocol.revoke(s,i);}});
 assertCheck(await lifecycle.activate(false)==='disabled','actual lifecycle requires explicit user action');
 assertCheck(await lifecycle.activate(true)==='registered','actual lifecycle reaches real registry through authenticated composition');
 failClientRevoke=true;assertCheck(await lifecycle.revoke()===false,'failed revoke remains unconfirmed');
 assertCheck(nativeSnapshot.ownerId===''&&!nativeSnapshot.token,'local native scope is cleared before failed backend revoke');
 currentClient=clientIdentities[1];assertCheck(await lifecycle.activate(true)==='unconfirmed','new account cannot bypass unresolved old revoke');
 assertCheck(!sessionChanges.includes(currentClient.ownerId),'unresolved revoke prevents assigning new native owner');
 failClientRevoke=false;assertCheck(await lifecycle.activate(true)==='registered','confirmed old revoke permits explicit new-account enrollment');
 const priorLifecycle=await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[0],nativeSnapshot.installationId),newLifecycle=await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[1],nativeSnapshot.installationId);
 assertCheck(!priorLifecycle.registered&&newLifecycle.registered,'account switch leaves only new lifecycle binding active');
 const lifecycleRevokes=clientRequests.filter(r=>r.action==='revoke'&&r.ownerId===clientOwners[0].ownerId).slice(-3);
 assertCheck(lifecycleRevokes.length===3&&new Set(lifecycleRevokes.map(r=>r.mutationId)).size===1,'failed revoke retries captured old owner with fixed operation ID');
 lifecycle.dispose();
 await deleteNativeAccountWithRegistry(platformBridge.registryDb,clientOwners[0],platformBridge.canonicalDeletion(c=>c.query('DELETE FROM crewcheck_platform_profiles WHERE email=$1',[clientOwners[0].email])));
 assertCheck((await readNativeProtocolInstallation(platformBridge.registryDb,clientOwners[1],nativeSnapshot.installationId)).registered,'atomic deletion of old owner preserves replacement account binding');
 currentClient=clientIdentities[0];await assert.rejects(makeClient().register(clientSnapshot,currentClient,true));checks++;
 assertCheck((await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?',[clientOwners[0].email]))[0].length===0,'client request cannot recreate erased account');
 const [allClientState]=await db.query("SELECT payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-native-push:%'");
 assertCheck(allClientState.every(row=>!String(row.payload).includes('SYNTHETIC_CLIENT_FCM_TOKEN')),'new end-to-end tokens are never stored plaintext');
 const report={passed:true,checks,realMySQL:true,disposableOnly:true,platformAdapterIntegration:true,existingIdentityComposition:true,ingressBeforeAuthority:true,
   realClientProtocol:{commit:clientManifest.commit,gitBlob:clientManifest.gitBlob,sha256:clientManifest.sha256},testedSourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
   socketNativeAndWebLockSimulated:true,externalProviderCalls:0,realTokens:0,productionActivation:false};
 fs.mkdirSync('artifacts/native-registry-off',{recursive:true});fs.writeFileSync('artifacts/native-registry-off/sql-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {fixtureKey.fill(0);clientAuthKey.fill(0);await db.end();}
