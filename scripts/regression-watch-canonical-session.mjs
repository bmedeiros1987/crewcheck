import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import * as common from '../server/v139/common.mjs';
import {verifiedStayLease} from '../shared/stay-alarm-lease-policy.mjs';
import {createCanonicalWatchHost,captureCanonicalGetMe} from '../server/watch-authority/canonical-host.mjs';
import {SQL} from '../server/watch-authority/mysql-adapter.mjs';
import {REGISTRY_SQL as S} from '../server/watch-authority/mysql-authority-producer.mjs';
import {authFixture,flushAuth} from './auth-contract-fixture.mjs';
process.env.CREWCHECK_AUTH_SECRET='synthetic-watch-fixture-only-not-production';process.env.CREWCHECK_WATCH_AUTHORITY_ENABLED='true';
const mysqlMode=process.env.CREWCHECK_WATCH_INNODB_QA==='github-disposable-mysql';
let clock=Date.now(),pool,failCommit=false,lostAck=false;
const profile={email:'watch@example.invalid',public_id:'watch-synthetic-A',display_name:'Synthetic',plan:'free'};
function fakePool(){let disk={sessions:new Map(),grants:new Map()},tail=Promise.resolve();
 const query=async(sql,args=[])=>{
  if(sql.includes('CREATE TABLE'))return [{}];
  if(sql.includes('SELECT crew_function'))return [[]];
  if(sql.includes('SELECT * FROM crewcheck_platform_profiles'))return [[profile]];
  if(sql.includes('SELECT must_change_password'))return [[{must_change_password:0}]];
  throw Error('Unexpected nontransaction SQL');
 };
 return {query,async getConnection(){let unlock;const prior=tail;tail=new Promise(r=>unlock=r);await prior;let working;
  return {beginTransaction:async()=>{working=structuredClone(disk);},execute:async(sql,a=[])=>{
   if(sql.startsWith('SET TRANSACTION'))return [{}];assert(working);
   if(sql.startsWith('SELECT p.public_id'))return [[{public_id:profile.public_id,must_change_password:0}]];
   const k=JSON.stringify(sql===S.activate?a.slice(2):a.slice(0,2));
   if(sql===S.ensure){if(!working.sessions.has(k))working.sessions.set(k,{owner_id:a[0],session_id:a[1],epoch:null,revoked:a[2],expires_at:a[3],version:1});return [{affectedRows:1}];}
   if(sql===S.lock)return [[...(working.sessions.has(k)?[working.sessions.get(k)]:[])]];
   if(sql===S.activate){const row=working.sessions.get(k);if(!row||row.revoked)return [{affectedRows:0}];row.epoch=a[0];row.expires_at=a[1];row.version++;return [{affectedRows:1}];}
   if(sql===S.invalidate){const row=working.sessions.get(k);row.revoked=1;row.epoch=null;row.version++;return [{affectedRows:1}];}
   if(sql===SQL.find||sql===SQL.lock)return [[...(working.grants.has(a[0])?[working.grants.get(a[0])]:[])]];
   if(sql===SQL.insert){assert(!working.grants.has(a[0]));working.grants.set(a[0],{record_json:a[1],version:1});return [{affectedRows:1}];}
   if(sql===SQL.cas){const row=working.grants.get(a[1]);if(!row||row.version!==a[2])return [{affectedRows:0}];working.grants.set(a[1],{record_json:a[0],version:row.version+1});return [{affectedRows:1}];}
   throw Error('Unexpected transaction SQL');
  },commit:async()=>{if(failCommit)throw Error('synthetic commit failure');disk=working;if(lostAck)throw Error('synthetic uncertain commit');},rollback:async()=>{},release:()=>unlock()};
 }};
}
if(mysqlMode){
 assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.CREWCHECK_QA_MYSQL_SOCKET,'/tmp/crewcheck-watch-authority-qa-socket/mysqld.sock');
 const mysql=(await import('mysql2/promise')).default;pool=mysql.createPool({socketPath:process.env.CREWCHECK_QA_MYSQL_SOCKET,user:'root',database:'crewcheck_watch_authority_qa',connectionLimit:6});
 for(const sql of [
  'CREATE TABLE crewcheck_platform_profiles(email VARCHAR(254) PRIMARY KEY,public_id VARCHAR(256),display_name VARCHAR(120),plan VARCHAR(64)) ENGINE=InnoDB',
  'CREATE TABLE crewcheck_platform_accounts(email VARCHAR(254) PRIMARY KEY,must_change_password TINYINT NOT NULL) ENGINE=InnoDB',
  'CREATE TABLE crewcheck_watch_sessions(owner_id VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,session_id VARCHAR(256) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,epoch CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,revoked TINYINT NOT NULL,expires_at BIGINT NOT NULL,version BIGINT UNSIGNED NOT NULL,PRIMARY KEY(owner_id,session_id)) ENGINE=InnoDB',
  'CREATE TABLE crewcheck_watch_grants(proof_id CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,record_json LONGTEXT NOT NULL,version BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB'
 ])await pool.query(sql);
 await pool.query('INSERT INTO crewcheck_platform_profiles VALUES(?,?,?,?)',Object.values(profile));await pool.query('INSERT INTO crewcheck_platform_accounts VALUES(?,0)',[profile.email]);
 const [engines]=await pool.query("SELECT ENGINE FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()");assert(engines.length===4&&engines.every(r=>r.ENGINE==='InnoDB'));
}else pool=fakePool();
const source=fs.readFileSync('server/v139/auth.mjs','utf8'),ast=ts.createSourceFile('auth.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=['me','normalizeCrewFunction','ensureCrewFunctionTable','enrichCrewFunction'];const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');
const sandbox={...common,verifiedStayLease,CREW_FUNCTIONS:new Set(),console};vm.runInNewContext(functions+';globalThis.handler=me;',sandbox);
const user={id:profile.public_id,email:profile.email,name:'Synthetic',role:'free',plan:'free',verified:true};
const req=()=>({headers:{authorization:'Bearer '+common.issueJwt(user)}});const a=req(),b=req();assert.notEqual(common.requestToken(a),common.requestToken(b),'same-second canonical issuer creates independent JTIs');
const native={challenge:'synthetic-native',receiverChallenge:'a'.repeat(64),document:'synthetic-doc',instance:'synthetic-instance'};
let host=createCanonicalWatchHost({pool,verifyJwt:common.verifyJwt,requestToken:common.requestToken,clock:()=>clock});
const resolve=r=>captureCanonicalGetMe(sandbox.handler,r,pool);const issue=async(r,extra={})=>host.issueAfterCanonicalGetMe(r,await resolve(r),{...native,...extra});
try{
 assert.equal((await host.issueAfterCanonicalGetMe(a,undefined,native)).ok,false);
 assert.equal((await host.issueAfterCanonicalGetMe(a,{...user,id:'other'},native)).ok,false);
 process.env.CREWCHECK_WATCH_AUTHORITY_ENABLED='false';const legacy=req();process.env.CREWCHECK_WATCH_AUTHORITY_ENABLED='true';assert.equal((await issue(legacy)).ok,false,'legacy JWT cannot mint Watch epoch');
 const first=await issue(a,{owner:'attacker',session:'attacker',epoch:'attacker'});assert(first.ok);assert.equal(first.record.owner,user.id);assert.notEqual(first.record.session,'attacker');
 const request={...first.record,redemption:'synthetic-attempt-A'};
 const winners=await Promise.all([host.consumeNativeProof(request),host.consumeNativeProof({...request,redemption:'competitor'})]);assert.equal(winners.filter(x=>x.ok).length,1);
 host=createCanonicalWatchHost({pool,verifyJwt:common.verifyJwt,requestToken:common.requestToken,clock:()=>clock});const retry=await host.consumeNativeProof(request);assert(retry.ok&&retry.idempotent);assert.equal(retry.record.leaseDeadline,first.record.leaseDeadline);
 const sibling=await issue(b);assert(sibling.ok);assert.notEqual(sibling.record.session,first.record.session);
 const staleGetMe=await resolve(a);assert((await host.invalidateCanonicalLogout(a)).ok);assert.equal((await host.issueAfterCanonicalGetMe(a,staleGetMe,native)).ok,false,'logout after getMe before issue is durable');assert.equal((await host.consumeNativeProof(request)).ok,false);assert((await host.consumeNativeProof({...sibling.record,redemption:'B'})).ok,'same owner other login remains independent');
 const c=req();await host.invalidateCanonicalLogout(c);assert.equal((await issue(c)).ok,false,'logout before first proof leaves tombstone');
 const d=req(),grant=await issue(d);const race=await Promise.all([host.invalidateCanonicalLogout(d),host.consumeNativeProof({...grant.record,redemption:'D'})]);assert(race[0].ok);assert.equal((await host.consumeNativeProof({...grant.record,redemption:'D'})).ok,false,'no use after logout commit regardless race winner');
 if(!mysqlMode){const e=req(),g=await issue(e),r={...g.record,redemption:'E'};failCommit=true;await assert.rejects(host.consumeNativeProof(r),/commit/);failCommit=false;lostAck=true;await assert.rejects(host.consumeNativeProof(r),/uncertain/);lostAck=false;assert((await host.consumeNativeProof(r)).idempotent);}
 clock=sibling.record.leaseDeadline;assert.equal((await host.consumeNativeProof({...sibling.record,redemption:'B'})).ok,false,'strict independent lease expiry');
 const f=authFixture();f.seed('synthetic-token-A');await f.auth.logout();assert.equal(f.data.get('crewcheck_auth_token'),undefined);assert.equal(f.requests[0].options.headers.authorization,'Bearer synthetic-token-A');f.seed('synthetic-token-B',{...user,id:'B'});f.requests[0].respond(503,{ok:false});await flushAuth();assert.equal(f.data.get('crewcheck_auth_token'),'synthetic-token-B');
 console.log('PASS '+(mysqlMode?'real InnoDB':'synthetic SQL')+' integrated canonical getMe/JWT/logout: same-second independent JTI, legacy denial, owner, restart, one-use/race, tombstone, sibling session, expiry and logout token continuity. No production activation.');
}finally{await pool.end?.();}
