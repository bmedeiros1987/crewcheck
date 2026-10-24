import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import {mutateNativeInstallation,readNativeInstallation,deleteNativeAccountWithRegistry,nativeBindingKey,NATIVE_PROJECT,NATIVE_PACKAGE} from '../server/native-push/registry.mjs';
import {applyNativeProtocolMutation} from '../server/native-push/protocol-adapter.mjs';

const value=process.env.NATIVE_PUSH_TEST_MYSQL_URL;
const url=new URL(value||'mysql://invalid/');
assert.equal(process.env.NATIVE_PUSH_SQL_DISPOSABLE,'1','explicit disposable fixture only');
assert(['127.0.0.1','localhost'].includes(url.hostname),'no production/external database');
assert(/^\/crewcheck_native_fixture_[a-z0-9_]+$/.test(url.pathname),'dedicated test database only');
assert.equal(decodeURIComponent(url.username),'native_fixture','dedicated synthetic user only');
let db=mysql.createPool({uri:value,connectionLimit:8});
const fixtureKey=crypto.randomBytes(32);
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
 await db.query('CREATE TABLE crewcheck_platform_profiles (email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(160) NOT NULL) ENGINE=InnoDB');
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
 await assert.rejects(applyNativeProtocolMutation(lostAckPool,owners[0],protocolWire,{protection,now:1700000000200}),/SYNTHETIC_COMMIT_ACK_LOST/);checks++;
 const protocolAck=await applyNativeProtocolMutation(db,owners[0],protocolWire,{protection,now:1700000000300});
 assertCheck(protocolAck.registered&&protocolAck.duplicate&&protocolAck.revision===1&&protocolAck.received===null,'wire lost ACK reconciles once without claiming delivery');
 await assert.rejects(applyNativeProtocolMutation(db,owners[0],{...protocolWire,token:token+'DIFFERENT'},{protection}),e=>e.code==='NATIVE_MUTATION_REUSED');checks++;
 const protocolRevoke={...protocolWire,action:'revoke',consent:false,token:undefined,mutationId:'synthetic-protocol-revoke',expectedRevision:1,expectedConsentRevision:1};
 const revokedAck=await applyNativeProtocolMutation(db,owners[0],protocolRevoke,{});
 assertCheck(revokedAck.revoked&&!revokedAck.registered&&revokedAck.revision===2,'wire revoke commits before correlated ACK');
 await assert.rejects(applyNativeProtocolMutation(db,owners[0],{...protocolWire,mutationId:'synthetic-protocol-stale',expectedRevision:2,expectedConsentRevision:2},{protection}),e=>e.code==='NATIVE_GENERATION_REVOKED');checks++;
 const report={passed:true,checks,realMySQL:true,disposableOnly:true,externalProviderCalls:0,realTokens:0,productionActivation:false};
 fs.mkdirSync('artifacts/native-registry-off',{recursive:true});fs.writeFileSync('artifacts/native-registry-off/sql-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
} finally {fixtureKey.fill(0);await db.end();}
