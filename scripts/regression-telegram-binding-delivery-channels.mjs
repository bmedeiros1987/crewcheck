import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
const start=source.indexOf('async function deliverJob(job) {');
const end=source.indexOf('\nfunction commuteRouteKey',start);
assert(start>=0&&end>start);
let reads=0,prepares=0,phones=0,texts=0,calls=0,binding=null;
const context=vm.createContext({dbPool:async()=>{reads++;return{};},linkedTelegramRecord:async()=>binding,prepareScheduledWakeup:async()=>{prepares++;return{ok:true,text:'SYNTHETIC'};},sendInfobipPhone:async()=>{phones++;return{ok:true,configured:true};},sendTelegram:async()=>{texts++;return{ok:true,configured:true};},callTelegram:async()=>{calls++;return{ok:true,configured:true};}});
vm.runInContext(source.slice(start,end)+'\nglobalThis.deliverJob=deliverJob;',context);
for(const channel of ['phone-call','phone','infobip']){const r=await context.deliverJob({channel,email:'qa@example.invalid',phone:'SYNTHETIC'});assert.equal(r.ok,true);}
assert.equal(reads,0,'phone-only must not depend on Telegram storage');assert.equal(phones,3);
let result=await context.deliverJob({channel:'all',email:'qa@example.invalid',phone:'SYNTHETIC'});
assert.equal(result.ok,true);assert.equal(phones,4);assert.equal(result.results.filter(r=>r.blocked).length,2);assert.equal(texts+calls,0);
const before=prepares;result=await context.deliverJob({channel:'telegram',email:'qa@example.invalid',chat_id:'123'});assert.equal(result.ok,false);assert.equal(prepares,before,'blocked Telegram-only job must not invoke speech preparation');
binding={chatId:'123',username:'synthetic_user'};
result=await context.deliverJob({channel:'all',email:'qa@example.invalid',chat_id:'123',telegram_username:'wrong_user',phone:'SYNTHETIC'});assert.equal(result.ok,true);assert.equal(texts,1);assert.equal(calls,0);assert.equal(phones,5);assert.equal(result.results.find(r=>r.channel==='telegram-call').blocked,true);
console.log('PASS prepared delivery channels: phone aliases independent, mixed channel isolation, blocked-only preparation avoided, destination checked per channel; synthetic providers only');
