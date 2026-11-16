import {mysqlAdapter} from '../server/mysql-platform-adapter.mjs';
import {createTelegramBindingRuntime} from '../server/telegram-binding-runtime.mjs';
import assert from 'node:assert/strict';
import {createTelegramBindingChallenge as start,consumeTelegramBindingChallenge as consume,readVerifiedTelegramBinding as read,updateTelegramBindingMetadata as update,inspectTelegramBindingPair as inspect} from '../server/telegram-binding-state.mjs';
import {telegramBindingMemory}from'./fixtures/telegram-binding-memory.mjs';
globalThis.fetch=()=>{throw Error('External network forbidden');};
const sql=process.env.TELEGRAM_BINDING_QA==='isolated-mysql'?await (await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory():null;const fixture=async()=>sql?sql.make():telegramBindingMemory();
try{
const NOW=Date.parse('2026-11-16T12:00:00Z'),A='synthetic-a@example.invalid',B='synthetic-b@example.invalid',C='synthetic-c@example.invalid',X='9000012345';let sequence=0;const nextCode=()=>`cc_synthetic_${String(++sequence).padStart(4,'0')}`;
const options={now:NOW,newBindingId:()=>`synthetic-binding-${sequence}`};
const binding=(email=A,chatId=X)=>({email,chatId,code:nextCode(),name:'SYNTHETIC',linkedAt:new Date(NOW-60000).toISOString(),bindingId:'synthetic-existing',callMeBotVerifiedAt:new Date(NOW-30000).toISOString()});
const challenge=async(f,email)=>{const code=nextCode();await start(f.pool,{email,code,name:'SYNTHETIC',accessKeyHash:'a'.repeat(64)},{now:NOW});return code;};
const claim=(f,code,confirmed=false,extra={})=>consume(f.pool,{code,chatId:X,chatType:'private',senderId:X,username:'synthetic_qa',confirmed,...extra},options);
const safe=async()=>{};let checks=0;
{
 const f=await fixture();await f.seedLink(binding());const code=await challenge(f,B),before=(await f.state());assert.equal((await claim(f,code)).status,'confirmation_required');assert.deepEqual((await f.state())['link-email:'+A],before['link-email:'+A]);assert(!(await f.state())['link-email:'+B]);
 await assert.rejects(claim(f,code,true),{code:'LINK_DELIVERY_ADMISSION_REQUIRED'});assert((await f.state())['link-email:'+A]);
 const transferred=await claim(f,code,true,{assertTransferSafe:safe});assert.equal(transferred.status,'linked');assert.equal((await read(f.pool,{chatId:X})).email,B);assert.equal(await read(f.pool,{email:A}),null);assert(!(await f.state())['link-code:'+before['link-email:'+A].code]);assert.equal(transferred.binding.callMeBotVerifiedAt,undefined);
 await assert.rejects(claim(f,code,true,{assertTransferSafe:safe}),{code:'LINK_CODE_EXPIRED'});await assert.rejects(update(f.pool,before['link-email:'+A],{username:'late_reply'}),{code:'LINK_GENERATION_CHANGED'});assert.equal((await read(f.pool,{chatId:X})).email,B);
 const back=await challenge(f,A);assert.equal((await claim(f,back)).status,'confirmation_required');await claim(f,back,true,{assertTransferSafe:safe});assert.equal((await read(f.pool,{chatId:X})).email,A);assert.equal(await read(f.pool,{email:B}),null);assert.equal(Object.keys((await f.state())).filter(k=>k.startsWith('link-email:')).length,1);checks+=8;
}
{
 const f=await fixture(),old=binding();await f.seedLink(old);const code=await challenge(f,A);assert.equal((await claim(f,code)).status,'unchanged');assert.deepEqual(await read(f.pool,{email:A}),old);const updated=await update(f.pool,old,{username:'updated_qa'});assert.equal((await read(f.pool,{chatId:X})).username,'updated_qa');assert.equal(updated.bindingId,old.bindingId);await assert.rejects(update(f.pool,old,{email:B}),{code:'LINK_METADATA_FIELD_FORBIDDEN'});checks+=4;
}
{
 const f=await fixture();await f.seedLink(binding(A));await f.seedLink(binding(B));await assert.rejects(read(f.pool,{chatId:X}),{code:'LINK_STATE_AMBIGUOUS'});await assert.rejects(read(f.pool,{email:A}),{code:'LINK_STATE_AMBIGUOUS'});const code=await challenge(f,B);await claim(f,code);await claim(f,code,true,{assertTransferSafe:safe});assert.equal((await read(f.pool,{chatId:X})).email,B);assert.equal(await read(f.pool,{email:A}),null);checks+=4;
}
{
 const f=await fixture(),codes=await Promise.all(Array.from({length:12},()=>challenge(f,A)));assert.equal(Object.keys((await f.state())).filter(k=>k.startsWith('pending:')).length,1);const results=await Promise.allSettled(codes.map(code=>claim(f,code)));assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await read(f.pool,{chatId:X})).email,A);checks+=3;
}
{
 const f=await fixture();await f.seedLink(binding());const b=await challenge(f,B),c=await challenge(f,C);await claim(f,b);await claim(f,c);await claim(f,c,true,{assertTransferSafe:safe});await assert.rejects(claim(f,b,true,{assertTransferSafe:safe}),{code:'LINK_CONFIRMATION_STALE'});assert.equal((await read(f.pool,{chatId:X})).email,C);checks+=2;
}
for(const mode of ['write:link-chat','delete:pending','commit-before','commit-after']){
 const f=await fixture(),code=await challenge(f,A),before=(await f.state());f.failNext(mode);await assert.rejects(claim(f,code),error=>['LINK_STORAGE_UNAVAILABLE','LINK_COMMIT_UNCERTAIN'].includes(error.code));
 if(mode==='commit-after'){assert.equal((await read(f.pool,{chatId:X})).email,A);await assert.rejects(claim(f,code),{code:'LINK_CODE_EXPIRED'});}else assert.deepEqual((await f.state()),before);
 if(mode.startsWith('commit'))assert.equal(f.stats.destroyed,1);checks++;
}
{
 const f=await fixture(),code=await challenge(f,A),before=(await f.state());await assert.rejects(consume(f.pool,{code,chatId:X,chatType:'group',senderId:X},options),{code:'PRIVATE_CHAT_REQUIRED'});assert.deepEqual((await f.state()),before);await assert.rejects(consume(f.pool,{code,chatId:X,chatType:'private',senderId:X},{...options,now:NOW+600000}),{code:'LINK_CODE_EXPIRED'});assert.deepEqual((await f.state()),before);checks+=2;
 const collision=code.toUpperCase().replace('CC_','cc_');await assert.rejects(start(f.pool,{email:B,code:collision},{now:NOW}),{code:'LINK_CODE_COLLISION'});checks++;
}
{
 const f=await fixture();await f.seedLink(binding());const code=await challenge(f,B);await claim(f,code);const before=(await f.state());await assert.rejects(claim(f,code,true,{assertTransferSafe:async()=>{throw Error('SYNTHETIC_DELIVERY_PENDING');}}),{code:'LINK_STORAGE_UNAVAILABLE'});assert.deepEqual((await f.state()),before);checks++;
 await assert.rejects(consume(f.pool,{code,chatId:'9000099999',senderId:'9000099999',chatType:'private',confirmed:true,assertTransferSafe:safe},options),{code:'LINK_CONFIRMATION_CHAT_MISMATCH'});assert.deepEqual((await f.state()),before);checks++;
}
{
 const f=await fixture(),code=await challenge(f,A),before=(await f.state());f.failNext(['write:link-chat','rollback']);await assert.rejects(claim(f,code),{code:'LINK_COMMIT_UNCERTAIN'});assert.equal(f.stats.destroyed,1);assert.deepEqual((await f.state()),before);checks++;
 const g=await fixture();g.failNext('begin');await assert.rejects(challenge(g,A),{code:'LINK_COMMIT_UNCERTAIN'});assert.equal(g.stats.destroyed,1);assert.equal(g.stats.released,0);checks++;
}
{
 const f=await fixture();await f.seed({'pending:cc_synthetic_legacy':{email:A,createdAt:new Date(NOW).toISOString()}});await assert.rejects(claim(f,'cc_synthetic_legacy'),{code:'LINK_CODE_EXPIRED'});checks++;
 await assert.rejects(start(f.pool,{email:A,code:nextCode(),accessKeyHash:'NOT_A_HASH'},{now:NOW}),{code:'INVALID_ACCESS_KEY_HASH'});checks++;
 await assert.rejects(read({query:async()=>{throw Error('SYNTHETIC_PRIVATE_DB_DETAIL');}},{email:A}),e=>e.code==='LINK_STORAGE_UNAVAILABLE'&&!e.message.includes('PRIVATE_DB_DETAIL'));checks++;
}
{
 const f=await fixture();await f.seedLink(binding(A));await f.seedLink(binding(B));const before=(await f.state()),report=await inspect(f.pool,[{label:'official',email:A},{label:'gtest',email:B}]);assert.equal(report.sameChat,true);assert(report.accounts.every(a=>a.consistent===false));assert.deepEqual((await f.state()),before);const text=JSON.stringify(report);assert(!text.includes(A)&&!text.includes(B)&&!text.includes(X)&&!text.includes('cc_synthetic'));assert.equal(report.cacheNotAttested,true);checks++;
 await assert.rejects(inspect(f.pool,[{label:'official',email:A},{label:'gtest',email:A}]),{code:'DISTINCT_ACCOUNTS_REQUIRED'});checks++;
}
{
 const f=await fixture(),old=binding(A);await f.seedLink(old);let cache={pending:{},linked:{[A]:old}},cacheWrites=0;
 const runtime=createTelegramBindingRuntime({pool:async()=>f.pool,readCache:()=>structuredClone(cache),writeCache:value=>{cacheWrites++;cache=structuredClone(value);}});
 assert.equal((await runtime.resolveChat(X)).email,A);const code=await challenge(f,B);await runtime.consume({code,chatId:X,chatType:'private',senderId:X},options);await runtime.consume({code,chatId:X,chatType:'private',senderId:X,confirmed:true,assertTransferSafe:safe},options);assert.equal(Object.keys(cache.linked).length,0);assert(cacheWrites>0);
 cache.linked[A]=old;assert.equal((await runtime.resolveChat(X)).email,B,'late stale file cannot override canonical SQL');assert.equal(await runtime.resolveEmail(A),null);await assert.rejects(runtime.update(old,{username:'late_result'}),{code:'LINK_GENERATION_CHANGED'});assert.equal(cache.linked[A],undefined);assert.equal((await runtime.resolveChat(X)).email,B);
 const cold=createTelegramBindingRuntime({pool:async()=>f.pool});assert.equal((await cold.resolveChat(X)).email,B,'warm/cold readers agree after transfer');checks+=6;
}
{
 const f=await fixture(),old=binding(A);await f.seed({['link-email:'+A]:old});await assert.rejects(read(f.pool,{chatId:X}),{code:'LINK_STATE_AMBIGUOUS'});checks++;
}
{
 const f=await fixture(),old=binding(A);await f.seedLink(old);await update(f.pool,old,{username:'fresh_value'});await assert.rejects(update(f.pool,old,{username:'late_value'}),{code:'LINK_METADATA_STALE'});assert.equal((await read(f.pool,{email:A})).username,'fresh_value');checks++;
}
for(const corruption of ['forward','reverse']){
 const f=await fixture(),unrelated=binding(C,'9000077777');await f.seedLink(unrelated);const code=await challenge(f,B);await f.seed(corruption==='forward'?{['link-email:'+B]:unrelated}:{['link-chat:'+X]:unrelated});const before=(await f.state());await assert.rejects(claim(f,code),{code:'INVALID_BINDING_RECORD'});assert.deepEqual((await f.state()),before);assert.deepEqual((await f.state())['link-email:'+C],unrelated);checks++;
}
{
 const f=await fixture(),old=binding(A);await f.seedLink(old);const before=(await f.state());await assert.rejects(update(f.pool,old,{callMeBotVerifiedAt:{invalid:true}}),{code:'INVALID_LINK_METADATA'});assert.deepEqual((await f.state()),before);checks++;
}
{
 const f=await fixture(),wrapped=mysqlAdapter(f.pool),code=nextCode();await start(wrapped,{email:A,code},{now:NOW});await consume(wrapped,{code,chatId:X,senderId:X,chatType:'private'},options);assert.equal((await read(wrapped,{email:A})).email,A);checks++;
}
{
 const f=await fixture(),code=nextCode();await f.seedProfile(A,'synthetic-owner-A');await start(f.pool,{email:A,code,ownerId:'synthetic-owner-A'},{now:NOW});await f.deleteProfile(A);await assert.rejects(claim(f,code),{code:'LINK_ACCOUNT_CHANGED'});await f.seedProfile(A,'synthetic-recreated');await assert.rejects(claim(f,code),{code:'LINK_ACCOUNT_CHANGED'});assert.equal(await read(f.pool,{chatId:X}),null);checks++;
}
console.log(`PASS transactional Telegram binding core (${sql?'real isolated MySQL':'SQL double'}): ${checks} synthetic cases, confirmation/reversal, ambiguous legacy/cache refusal, concurrent challenges, CAS, expiry, corruption/failure and uncertain commit; no live data/routes/providers; synthetic fixtures only`);

}finally{if(sql)await sql.close();}
