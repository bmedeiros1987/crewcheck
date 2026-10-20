import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import mysql from 'mysql2/promise';
// Deliberately refuses production URLs/config: only the disposable GHA service.
assert.equal(process.env.CREWCHECK_GOOGLE_INNODB_QA,'github-disposable-mysql');
assert.equal(process.env.GITHUB_ACTIONS,'true');
const watchdog=setTimeout(()=>{console.error('FAIL bounded InnoDB QA timeout');process.exit(1);},90_000);watchdog.unref();
const pool=mysql.createPool({host:'127.0.0.1',port:3306,user:'root',password:'synthetic-google-qa-only',database:'crewcheck_google_identity_qa',connectionLimit:6,connectTimeout:5000});
const source=fs.readFileSync('server/mobile/google-identity-oidc.mjs','utf8');
const ast=ts.createSourceFile('oidc.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['safeText','encryptionKey','encryptPayload','decryptPayload','stateKey','storePut','storeGet','claimOnce','withLinkTransaction','epochKey','ownerEpoch','freshLinkedAccount','providerLinkKey','crewLinkKey','completionKey','sessionIdentity','maskEmail','callback','complete','completeLink','unlink']);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,'')).join('\n');
assert.equal(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).length,names.size);
// Execute the actual production table definition, never a Map or imitation store.
const ddl=source.match(/`(CREATE TABLE IF NOT EXISTS crewcheck_google_identity_oidc[\s\S]*?ENGINE=InnoDB[^`]+)`/)[1];
const cfg={configured:true,encryptionSecret:'synthetic-disposable-encryption-only',clientId:'synthetic'};
let exchangeEnter,exchangeRelease,exchangeCount=0;
const entered=()=>new Promise(r=>exchangeEnter=r);
const sandbox={crypto,Buffer,URL,Date,STATE_TTL_MS:600000,config:()=>cfg,dbPool:async()=>pool,readJson:async req=>req.body,
 sendJson:(res,status,body)=>Object.assign(res,{status,body}),callbackHtml:()=>'',
 exchangeCode:async()=>{exchangeCount++;exchangeEnter?.();await new Promise(r=>exchangeRelease=r);return{id_token:'synthetic'};},
 verifyGoogleIdToken:async()=>({sub:'google-synthetic',email:'a@example.invalid'})};
vm.createContext(sandbox);vm.runInContext(functions+'\nthis.api={storePut,storeGet,claimOnce,withLinkTransaction,stateKey,crewLinkKey,providerLinkKey,epochKey,complete,completeLink,unlink,callback};',sandbox);
const a=sandbox.api,user={sub:'owner-A',email:'a@example.invalid',exp:Math.floor(Date.now()/1000)+3600};
const providerKey=crypto.createHmac('sha256',cfg.encryptionSecret).update('google:google-synthetic').digest('hex');
const pk=a.providerLinkKey(providerKey),rk=a.crewLinkKey(user.sub,cfg.encryptionSecret),issued=[];
const context={identity:user,sessionKey:'a'.repeat(64),resolveAccount:async who=>({id:who.sub,email:who.email,name:'Synthetic',role:'free'}),issueSession:(res,u)=>{issued.push(u);Object.assign(res,{status:200});}};
const response=()=>({writeHead(status){this.status=status;},end(){}});
const seed=async()=>{await a.storePut(pk,{user,providerKey,linkId:'link-A',revision:'unlinked-v1'});await a.storePut(rk,{providerKey,linkId:'link-A',revision:'unlinked-v1'});};
const ready=async state=>a.storePut(a.stateKey(state),{status:'ready',intent:'login',user,providerKey,linkId:'link-A',ownerRevision:'unlinked-v1'},Date.now()+600000,true);
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
try {
 await pool.query(ddl);
 const [engine]=await pool.query("SELECT ENGINE FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='crewcheck_google_identity_oidc'");assert.equal(engine[0].ENGINE,'InnoDB');
 const c1=await pool.getConnection(),c2=await pool.getConnection();
 try {const [[id1]]=await c1.query('SELECT CONNECTION_ID() id'),[[id2]]=await c2.query('SELECT CONNECTION_ID() id');check(id1.id!==id2.id,'two physical connections');}finally{c1.release();c2.release();}
 await pool.query('DELETE FROM crewcheck_google_identity_oidc');
 // Actual global guard holds a second real transaction until first commits.
 let release,started;const hold=new Promise(r=>release=r),firstEntered=new Promise(r=>started=r);let secondEntered=false;
 const one=a.withLinkTransaction(async tx=>{started();await hold;await tx.put('qa:first',{ok:true});});await firstEntered;
 const two=a.withLinkTransaction(async tx=>{secondEntered=true;await tx.put('qa:second',{ok:true});});
 let waiting=false;
 try {
  for(let attempt=0;attempt<100&&!waiting;attempt++) {
   const [locks]=await pool.query("SELECT COUNT(*) waiting FROM performance_schema.data_lock_waits w JOIN performance_schema.data_locks l ON w.REQUESTING_ENGINE_LOCK_ID=l.ENGINE_LOCK_ID WHERE l.OBJECT_SCHEMA=DATABASE() AND l.OBJECT_NAME='crewcheck_google_identity_oidc'");
   waiting=Number(locks[0].waiting)>0;if(!waiting)await new Promise(r=>setTimeout(r,25));
  }
  check(waiting&&!secondEntered,'real InnoDB lifecycle guard lock wait observed');
 } finally {release();await Promise.all([one,two]);}
 check(secondEntered,'second progresses after commit');
 await assert.rejects(a.withLinkTransaction(async tx=>{await tx.put('qa:rollback',{bad:true});throw Error('synthetic rollback');}));check(await a.storeGet('qa:rollback')===null,'real SQL rollback');
 const claims=await Promise.all([a.claimOnce('qa:claim',{synthetic:true},Date.now()+600000),a.claimOnce('qa:claim',{synthetic:true},Date.now()+600000)]);check(claims.filter(Boolean).length===1,'PK one-use winner');
 await seed();await ready('double');const r1=response(),r2=response();await Promise.all([a.complete({method:'POST',body:{state:'double'}},r1,context),a.complete({method:'POST',body:{state:'double'}},r2,context)]);check([r1.status,r2.status].sort().join(',')==='200,409','double complete one winner');check(issued.length===1,'one canonical issuer call');
 await ready('owner');const wrong=response();await a.complete({method:'POST',body:{state:'owner'}},wrong,{...context,identity:{...user,sub:'owner-B'}});check(wrong.status===409,'other owner denied');check((await a.storeGet(a.stateKey('owner'))).payload.status==='ready','owner rejection rolls back consume');
 await a.unlink({method:'POST'},response(),{...context,identity:{...user,sub:'owner-B'}});check(!!await a.storeGet(pk)&&!!await a.storeGet(rk),'owner B unlink preserves owner A forward and reverse');
 // Suspend actual callback during synthetic provider exchange, unlink on a
 // different pooled connection, then resume: tombstone must defeat old revision.
 const state='pending-race';await a.storePut(a.stateKey(state),{status:'pending',intent:'link',owner:user,ownerRevision:'unlinked-v1',initiatorSession:context.sessionKey,verifier:'synthetic-verifier',nonce:'synthetic-nonce',expiresAt:Date.now()+600000},Date.now()+600000);
 const reached=entered(),cb=response();const pending=a.callback({},cb,new URL('https://example.invalid/callback?state='+state+'&code=synthetic'),context);await reached;
 const unlinked=response();await a.unlink({method:'POST'},unlinked,context);check(unlinked.status===200,'unlink commits while callback exchange suspended');exchangeRelease();await pending;check(cb.status===400,'callback cannot revive after unlink');check(await a.storeGet(pk)===null&&await a.storeGet(rk)===null,'both indexes remain absent');check(typeof (await a.storeGet(a.epochKey(user.sub,cfg))).payload.revision==='string','durable owner tombstone');
 const again=response();await a.callback({},again,new URL('https://example.invalid/callback?state='+state+'&code=synthetic'),context);check(again.status===400&&exchangeCount===1,'callback state is one-use');
 const after=response();await a.complete({method:'POST',body:{state:'owner'}},after,context);check(after.status===409,'prepared complete rejected after unlink');
 // Unlink with no prior link still leaves tombstone for that exact owner only.
 await a.unlink({method:'POST'},response(),{...context,identity:{...user,sub:'owner-B'}});check(!!await a.storeGet(a.epochKey('owner-B',cfg)),'unlink-before-link tombstone');
 console.log(`PASS real InnoDB Google identity: ${checks} checks; actual production SQL/transaction/callback/complete/unlink; two connections, rollback, one-use, owner and tombstone. Provider/auth I/O synthetic; no real accounts.`);
} finally {await pool.end();clearTimeout(watchdog);}
