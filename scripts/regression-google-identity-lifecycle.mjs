import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
const source=fs.readFileSync('server/mobile/google-identity-oidc.mjs','utf8');
const ast=ts.createSourceFile('oidc.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const names=new Set(['safeText','sessionIdentity','stateKey','providerLinkKey','crewLinkKey','completionKey','epochKey','ownerEpoch','freshLinkedAccount','maskEmail','callback','complete','completeLink','unlink']);
const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast).replace(/^export /,'')).join('\n');
const user={sub:'owner-A',email:'a@example.invalid',role:'premium',exp:Math.floor(Date.now()/1000)+3600};
function fixture() {
 const db=new Map(),issued=[],cfg={configured:true,encryptionSecret:'synthetic-only',clientId:'synthetic'},contexts={};let tail=Promise.resolve(),releaseExchange,exchangeStarted;
 const entered=new Promise(r=>exchangeStarted=r);
 const tx={get:async k=>structuredClone(db.get(k)||null),put:async(k,p)=>db.set(k,{payload:structuredClone(p)}),delete:async k=>db.delete(k)};
 const sandbox={crypto,Buffer,URL,Date,STATE_TTL_MS:600000,config:()=>cfg,dbPool:async()=>({}),readJson:async req=>req.body,
 sendJson:(res,status,body)=>Object.assign(res,{status,body}),storeGet:tx.get,storePut:tx.put,
 withLinkTransaction:fn=>{const run=tail.then(async()=>{const snapshot=structuredClone(db);try{return await fn(tx);}catch(e){db.clear();for(const[k,v]of snapshot)db.set(k,v);throw e;}});tail=run.catch(()=>{});return run;},
 exchangeCode:async()=>{exchangeStarted();await new Promise(r=>releaseExchange=r);return{id_token:'synthetic'};},verifyGoogleIdToken:async()=>({sub:'google-synthetic',email:user.email}),callbackHtml:()=>''};
 vm.createContext(sandbox);vm.runInContext(functions+'\nthis.api={complete,completeLink,unlink,callback,stateKey,crewLinkKey,providerLinkKey,epochKey};',sandbox);
 const a=sandbox.api,providerKey=crypto.createHmac('sha256',cfg.encryptionSecret).update('google:google-synthetic').digest('hex'),pk=a.providerLinkKey(providerKey),rk=a.crewLinkKey(user.sub,cfg.encryptionSecret);
 const context={identity:user,resolveAccount:async who=>({id:who.sub,email:who.email,role:'free',name:'Canonical synthetic'}),issueSession:(_res,u)=>issued.push(u)};
 return {a,db,issued,context,pk,rk,providerKey,entered,release:()=>releaseExchange(),
 seed(){db.set(pk,{payload:{user,providerKey,linkId:'link-A',revision:'unlinked-v1'}});db.set(rk,{payload:{providerKey,linkId:'link-A',revision:'unlinked-v1'}});},
 ready(state='ready'){db.set(a.stateKey(state),{payload:{status:'ready',intent:'login',user,providerKey,linkId:'link-A',ownerRevision:'unlinked-v1'}});},
 pending(){db.set(a.stateKey('pending'),{payload:{status:'pending',intent:'link',owner:user,ownerRevision:'unlinked-v1',nonce:'n',verifier:'v',expiresAt:Date.now()+60000},consumed:false});}};
}
const res=()=>({writeHead(){},end(){}});let cases=0;
{
 const f=fixture();f.seed();f.ready();await f.a.unlink({method:'POST'},res(),f.context);const r=res();await f.a.complete({method:'POST',body:{state:'ready'}},r,f.context);assert.equal(r.status,409);assert.equal(f.issued.length,0);assert.equal(f.db.has(f.pk),false);cases++;
}
{
 const f=fixture();f.seed();f.pending();const p=f.a.callback({},res(),new URL('https://example.invalid/callback?state=pending&code=synthetic'),f.context);await f.entered;
 await f.a.unlink({method:'POST'},res(),f.context);f.release();await p;assert.equal(f.db.has(f.pk),false);assert.equal(f.db.has(f.rk),false);assert.equal(f.db.get(f.a.stateKey('pending')).payload.status,'failed');cases++;
}
{
 const f=fixture();f.seed();f.ready();await Promise.all([f.a.complete({method:'POST',body:{state:'ready'}},res(),f.context),f.a.complete({method:'POST',body:{state:'ready'}},res(),f.context)]);
 assert.equal(f.issued.length,1);assert.equal(f.issued[0].role,'free');assert.equal(f.db.get(f.a.stateKey('ready')).payload.status,'completed');cases++;
}
{
 const f=fixture();f.seed();f.ready();const r=res();await f.a.complete({method:'POST',body:{state:'ready'}},r,{...f.context,identity:{sub:'owner-B'}});assert.equal(f.issued.length,0);assert.equal(r.status,409);cases++;
}
{
 const f=fixture();f.seed();f.ready();const r=res();await f.a.complete({method:'POST',body:{state:'ready'}},r,{...f.context,resolveAccount:async()=>null});assert.equal(f.issued.length,0);assert.equal(r.status,409);assert.equal(f.db.get(f.a.stateKey('ready')).payload.status,'ready');cases++;
}
{
 const f=fixture();f.seed();f.ready();await f.a.unlink({method:'POST'},res(),f.context);f.seed();await f.a.complete({method:'POST',body:{state:'ready'}},res(),f.context);assert.equal(f.issued.length,0);cases++;
}
{
 const f=fixture();f.seed();f.ready();const r=res();await f.a.complete({method:'POST',body:{state:'ready'}},r,{issueSession:f.context.issueSession});assert.equal(r.status,503);assert.equal(f.issued.length,0);cases++;
}
{
 const f=fixture();f.pending();const p=f.a.callback({},res(),new URL('https://example.invalid/callback?state=pending&code=synthetic'),{...f.context,identity:{sub:'owner-B'}});await f.entered;f.release();await p;
 assert.equal(f.db.has(f.pk),false);assert.equal(f.db.has(f.rk),false);assert.equal(f.db.get(f.a.stateKey('pending')).payload.status,'link_ready');
 const r=res();await f.a.completeLink({method:'POST',body:{state:'pending',confirmLink:true}},r,{...f.context,identity:{sub:'owner-B',email:'b@example.invalid',exp:user.exp}});assert.equal(r.status,409);assert.equal(f.db.has(f.pk),false);cases++;
 const success=res();await f.a.completeLink({method:'POST',body:{state:'pending',confirmLink:true}},success,f.context);assert.equal(success.status,200);assert.equal(f.db.get(f.pk).payload.user.sub,user.sub);cases++;
}
{
 const f=fixture();f.pending();const p=f.a.callback({},res(),new URL('https://example.invalid/callback?state=pending&code=synthetic'),f.context);await f.entered;f.release();await p;
 const r=res();await f.a.completeLink({method:'POST',body:{state:'pending',confirmLink:true}},r,{...f.context,identity:{...user,exp:1}});assert.equal(r.status,409);assert.equal(f.db.has(f.pk),false);cases++;
 await f.a.unlink({method:'POST'},res(),f.context);const revoked=res();await f.a.completeLink({method:'POST',body:{state:'pending',confirmLink:true}},revoked,f.context);assert.equal(revoked.status,409);assert.equal(f.db.has(f.pk),false);cases++;
}
// Exercise real SQL transaction wrapper with a synthetic connection, not an engine.
{
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='withLinkTransaction').getText(ast);const calls=[];
 const connection={beginTransaction:async()=>calls.push('begin'),query:async(sql)=>{calls.push(sql);return [[]];},commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release')};
 const c={dbPool:async()=>({getConnection:async()=>connection}),config:()=>({encryptionSecret:'synthetic'}),encryptPayload:()=> 'encrypted-synthetic',decryptPayload:()=>null,Date};
 vm.createContext(c);vm.runInContext(fn+'\nthis.run=withLinkTransaction;',c);
 await c.run(async tx=>{await tx.get('synthetic-key');});assert.equal(calls[0],'begin');assert.match(calls[2],/FOR UPDATE/);assert.ok(calls.indexOf('commit')>2);assert.equal(calls.at(-1),'release');
 calls.length=0;await assert.rejects(c.run(async()=>{throw new Error('synthetic rollback');}));assert.ok(calls.includes('rollback'));assert.equal(calls.includes('commit'),false);assert.equal(calls.at(-1),'release');cases++;
}
// Existing canonical issuer is reused; Google completion must not set a cookie.
{
 const auth=fs.readFileSync('server/v139/auth.mjs','utf8'),tree=ts.createSourceFile('auth.mjs',auth,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const code=tree.statements.filter(n=>ts.isFunctionDeclaration(n)&&['loginResponse','issueGoogleLinkedSession'].includes(n.name?.text)).map(n=>n.getText(tree).replace(/^export /,'')).join('\n');let cookies=0,tokens=0;
 const c={issueJwt:()=>{tokens++;return'synthetic-session';},setAuthCookie:()=>cookies++,sendJson:(_r,status,body)=>({status,body})};vm.createContext(c);vm.runInContext(code+'\nthis.issue=issueGoogleLinkedSession;',c);const r=c.issue({}, {id:user.sub,email:user.email},'synthetic');assert.equal(r.status,200);assert.equal(tokens,1);assert.equal(cookies,0);cases++;
}
assert.match(source,/verifiedMysqlTls\(/);assert.doesNotMatch(source,/rejectUnauthorized:\s*false/);
console.log(`Google OIDC lifecycle: ${cases} real-handler/issuer/transaction-wrapper synthetic cases PASS. No DB, provider or credential calls; SQL engine atomicity not established by fixture.`);
