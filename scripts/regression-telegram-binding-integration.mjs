import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
import {createTelegramBindingRuntime}from'../server/telegram-binding-runtime.mjs';
import {createTelegramBindingChallenge,consumeTelegramBindingChallenge,readVerifiedTelegramBinding,TelegramBindingError}from'../server/telegram-binding-state.mjs';
import {submitVerifiedTelegramBinding}from'../server/telegram-binding-delivery.mjs';
import {telegramBindingMemory}from'./fixtures/telegram-binding-memory.mjs';
globalThis.fetch=()=>{throw Error('External network forbidden');};
const source=fs.readFileSync('server.mjs','utf8'),ast=ts.createSourceFile('server.mjs',source,99,true,ts.ScriptKind.JS);
assert(source.includes('telegram-binding-confirmation-v1'),'Run canonical preparation before integration proof');
const names=['telegramProfileForChat','telegramProfileForChatAsync','telegramLinkedRecordForEmail','handleTelegramLinkStart','handleTelegramLinkStatus','telegramTryBindFromWebhook','refreshLinkedTelegramUsername','persistTelegramLinkRecord'];
const code=names.map(name=>{const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert(node,name);return node.getText(ast);}).join('\n');
const A='synthetic-a@example.invalid',B='synthetic-b@example.invalid',X='9000012345',profileId=email=>email===A?'synthetic-owner-A':'synthetic-owner-B';let sequence=1000;
const nextCode=()=>`cc_integration_${++sequence}`;
const sql=process.env.TELEGRAM_BINDING_QA==='isolated-mysql'?await(await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory():null;
const fixture=async()=>{const f=sql?await sql.make():telegramBindingMemory();await f.seedProfile(A,profileId(A));await f.seedProfile(B,profileId(B));return f;};
function context(f){
 let actor=A,result,cache={pending:{},linked:{}},lookup=async()=>'',writes=0,cacheWrites=0,requestAuth=true;const sent=[];
 const runtime=createTelegramBindingRuntime({pool:async()=>f.pool,readCache:()=>structuredClone(cache),writeCache:value=>{cacheWrites++;cache=structuredClone(value);}});
 const globals={structuredClone,URL,Date,TelegramBindingError,createTelegramBindingChallenge,telegramBindingRuntime:runtime,conciergeDbPool:async()=>f.pool,telegramLinksRead:()=>structuredClone(cache),telegramLinksWrite:()=>{writes++;},telegramRequestUser:(_req,body={})=>({email:body.email||'spoof@example.invalid',name:'SYNTHETIC',accessKeyHash:'a'.repeat(64)}),requireExistingIdentity:async(_req,res)=>{if(!requestAuth){globals.sendJson(res,401,{ok:false});return null;}return {email:actor,profile:{public_id:profileId(actor)}};},telegramAppRequestAllowed:user=>user.authenticated===true,conciergeLoadSnapshot:async()=>null,conciergeAccessMatches:user=>user.authenticated===true,readJsonBody:async req=>req.body||{},telegramLinkCode:nextCode,telegramConfigured:()=>true,telegramBotUsername:()=> 'synthetic_bot',normalizeTelegramUsername:value=>String(value||'').replace(/^@/,''),sendJson:(_res,status,body)=>{result={status,body};return result;},sendTelegramMessage:async(chat,text,extra)=>{sent.push({chat,text,extra});return {ok:true};},telegramUsernameFromChat:()=>lookup(),conciergeKeyboard:{},callMeBotAuthorizationKeyboard:()=>({}),CALLMEBOT_TELEGRAM_BOT_URL:'https://t.me/SYNTHETIC'};
 const ctx=vm.createContext(globals);vm.runInContext(code+'\nglobalThis.test={'+names.join(',')+'};',ctx);
 return {...ctx.test,runtime,sent,setActor:value=>{actor=value;},setAuth:value=>{requestAuth=value;},setCache:value=>{cache=structuredClone(value);},lookup:value=>{lookup=value;},stats:()=>({writes,cacheWrites}),result:()=>result};
}
const message=username=>({chat:{id:X,type:'private'},from:{id:X,username,first_name:'SYNTHETIC'}});
let checks=0;
try{
 const f=await fixture(),c=context(f);c.setAuth(false);await c.handleTelegramLinkStart({method:'POST'},{});assert.equal(c.result().status,401);assert(!Object.keys(await f.state()).some(k=>k.startsWith('pending:')));checks++;
 c.setAuth(true);c.setActor(A);await c.handleTelegramLinkStart({method:'POST',body:{email:B}},{});assert.equal(c.result().status,200);const a=c.result().body.code;assert.equal((await f.state())['pending:'+a].email,A,'body email cannot select binding owner');
 await c.telegramTryBindFromWebhook(message(''),'/start '+a);const original=await readVerifiedTelegramBinding(f.pool,{email:A});assert.equal(original.ownerId,profileId(A));assert.equal(c.sent.filter(x=>x.text.includes('individualmente')).length,0);assert(c.sent.some(x=>x.text.includes('Telegram vinculado')));checks+=3;
 c.setCache({pending:{},linked:{[A]:original}});c.setActor(B);await c.handleTelegramLinkStart({method:'POST'},{});const b=c.result().body.code;await c.telegramTryBindFromWebhook(message('test_user'),'/start '+b);assert.equal((await readVerifiedTelegramBinding(f.pool,{chatId:X})).email,A);assert(c.sent.some(x=>x.extra?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data==='cc_link_confirm:'+b));
 await c.telegramTryBindFromWebhook(message('test_user'),'/confirmar_vinculo '+b);assert.equal((await readVerifiedTelegramBinding(f.pool,{chatId:X})).email,A,'real handler cannot bypass missing delivery admission');assert(c.sent.some(x=>x.text.includes('Transferência bloqueada')));checks+=3;
 // The simulated operator supplies admission ONLY inside this isolated fixture.
 await consumeTelegramBindingChallenge(f.pool,{code:b,chatId:X,senderId:X,chatType:'private',confirmed:true,username:'test_user',assertTransferSafe:async()=>{}});
 c.setCache({pending:{},linked:{[A]:original}});const profile=await c.telegramProfileForChatAsync(message('test_user'));assert.equal(profile.email,B);assert.equal(profile.channel,'telegram');assert.equal(profile.linked,true);checks++;
 const poisoned={...await readVerifiedTelegramBinding(f.pool,{email:B}),channel:'app',chatType:'group'};await f.seedLink(poisoned);const trusted=await c.telegramProfileForChatAsync(message('test_user'));assert.equal(trusted.channel,'telegram');assert.equal(trusted.chatType,'private');checks++;

 const before=await f.state(),writes=c.stats().writes;await c.handleTelegramLinkStatus({method:'GET'}, {},new URL('https://fixture.invalid/api/telegram/link/status?email='+encodeURIComponent(A)+'&code='+a));assert.equal(c.result().body.accountEmail,B);assert.equal(c.result().body.linked,true);assert.deepEqual(await f.state(),before,'status cannot persist metadata or revive aliases');assert.equal(c.stats().writes,writes);checks+=2;
 c.setActor(A);await c.handleTelegramLinkStatus({method:'GET'},{},new URL('https://fixture.invalid/status'));assert.equal(c.result().body.ok,true,'unlinked status is a successful authenticated read');assert.equal(c.result().body.linked,false);assert.equal(c.result().body.chatId,'');assert.equal(c.result().body.accountEmail,A);checks++;
 // Real metadata updater must reject a late getChat result from the old account.
 const g=await fixture(),d=context(g);d.setActor(A);await d.handleTelegramLinkStart({method:'POST'},{});const first=d.result().body.code;await d.telegramTryBindFromWebhook(message(''),'/start '+first);const stale=await readVerifiedTelegramBinding(g.pool,{email:A});let releaseLookup;d.lookup(()=>new Promise(resolve=>{releaseLookup=resolve;}));const late=d.refreshLinkedTelegramUsername(stale);await new Promise(resolve=>setImmediate(resolve));
 d.setActor(B);await d.handleTelegramLinkStart({method:'POST'},{});const second=d.result().body.code;await d.telegramTryBindFromWebhook(message(''),'/start '+second);await consumeTelegramBindingChallenge(g.pool,{code:second,chatId:X,senderId:X,chatType:'private',confirmed:true,assertTransferSafe:async()=>{}});releaseLookup('late_user');await assert.rejects(late,{code:'LINK_GENERATION_CHANGED'});assert.equal((await readVerifiedTelegramBinding(g.pool,{chatId:X})).email,B);checks++;
 // Execute the actual prepared text transport with a provider double.
 const transport=fs.readFileSync('server/v139/delivery.mjs','utf8'),transportAst=ts.createSourceFile('delivery.mjs',transport,99,true,ts.ScriptKind.JS),fn=transportAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='sendTelegram');assert(fn);let calls=0;
 const t=vm.createContext({exports:{},AbortSignal,submitVerifiedTelegramBinding,dbPool:async()=>g.pool,telegramToken:()=> 'synthetic-provider-token',fetch:async()=>{calls++;return {ok:true,json:async()=>({ok:true})};}});vm.runInContext(ts.transpileModule(fn.getText(transportAst),{compilerOptions:{target:99,module:ts.ModuleKind.CommonJS}}).outputText,t);
 const denied=await t.exports.sendTelegram(X,'SYNTHETIC PRIVATE A',stale);assert.equal(denied.ok,false);assert.equal(calls,0);const current=await readVerifiedTelegramBinding(g.pool,{email:B});const accepted=await t.exports.sendTelegram(X,'SYNTHETIC B',current);assert.equal(accepted.ok,true);assert.equal(calls,1);checks+=2;
 // An in-flight provider must not enable a real replacement or trigger retries.
 let releaseProvider,providerEntered;const entered=new Promise(resolve=>{providerEntered=resolve;});let attempts=0;
 const inFlight=submitVerifiedTelegramBinding(g.pool,current,{chatId:X},async()=>{attempts++;providerEntered();return new Promise(resolve=>{releaseProvider=resolve;});});await entered;
 d.setActor(A);await d.handleTelegramLinkStart({method:'POST'},{});const pending=d.result().body.code;
 await d.telegramTryBindFromWebhook(message(''),'/start '+pending);
 await d.telegramTryBindFromWebhook(message(''),'/confirmar_vinculo '+pending);
 assert.equal((await readVerifiedTelegramBinding(g.pool,{chatId:X})).email,B,'in-flight delivery cannot unlock replacement');releaseProvider({ok:true});assert.equal((await inFlight).ok,true);assert.equal(attempts,1);checks++;
 const unknown=await submitVerifiedTelegramBinding(g.pool,current,{chatId:X},async()=>{attempts++;throw Error('synthetic lost acknowledgement');});assert.equal(unknown.uncertain,true);assert.equal(attempts,2,'unknown outcome must not retry provider');checks++;
 const changedTarget={chatId:X};const captured=submitVerifiedTelegramBinding(g.pool,current,changedTarget,async()=>({ok:true}));changedTarget.chatId='9000099999';assert.equal((await captured).ok,true,'destination must be captured before SQL await');checks++;
 console.log(`PASS prepared Telegram integration (${sql?'isolated MySQL':'SQL double'}): ${checks} authenticated-owner, real handlers/status, callback confirmation, blocked live transfer, stale cache/getChat and prepared provider-fence cases; no real messages`);
}finally{if(sql)await sql.close();}
