import assert from 'node:assert/strict';
import {createTelegramBindingChallenge,consumeTelegramBindingChallenge,readVerifiedTelegramBinding,admitTelegramBindingDelivery,finishTelegramBindingDelivery,assertNoAdmittedTelegramDeliveries} from '../server/telegram-binding-state.mjs';
import {submitVerifiedTelegramBinding} from '../server/telegram-binding-delivery.mjs';
import {telegramBindingMemory} from './fixtures/telegram-binding-memory.mjs';
const sql=process.env.TELEGRAM_BINDING_QA==='isolated-mysql'?await(await import('./fixtures/telegram-binding-mysql.mjs')).telegramBindingMysqlFactory():null;
const A='admission-a@example.invalid',B='admission-b@example.invalid',chatId='9000012345';let seq=0,checks=0;
const fixture=async()=>{const f=sql?await sql.make():telegramBindingMemory();await createTelegramBindingChallenge(f.pool,{email:A,code:'cc_admission_first'});await consumeTelegramBindingChallenge(f.pool,{code:'cc_admission_first',chatId,senderId:chatId,chatType:'private'});return f;};
async function replacement(f){const code='cc_admission_next_'+ ++seq;await createTelegramBindingChallenge(f.pool,{email:B,code});await consumeTelegramBindingChallenge(f.pool,{code,chatId,senderId:chatId,chatType:'private'});return ()=>consumeTelegramBindingChallenge(f.pool,{code,chatId,senderId:chatId,chatType:'private',confirmed:true,assertTransferSafe:assertNoAdmittedTelegramDeliveries});}
try{
 for(const outcome of ['accepted','rejected','uncertain']){
  const f=await fixture(),binding=await readVerifiedTelegramBinding(f.pool,{email:A});const admission=await admitTelegramBindingDelivery(f.pool,binding,{chatId});const transfer=await replacement(f);
  await assert.rejects(transfer,{code:'LINK_DELIVERY_IN_FLIGHT'});checks++;
  await finishTelegramBindingDelivery(f.pool,admission.id,outcome);
  if(outcome==='uncertain')await assert.rejects(transfer,{code:'LINK_DELIVERY_IN_FLIGHT'});else assert.equal((await transfer()).status,'linked');checks++;
 }
 const f=await fixture(),binding=await readVerifiedTelegramBinding(f.pool,{email:A});let entered,release;const started=new Promise(r=>entered=r);let calls=0;
 const flight=submitVerifiedTelegramBinding(f.pool,binding,{chatId},async()=>{calls++;entered();await new Promise(r=>release=r);return{ok:true};});await started;
 const transfer=await replacement(f);await assert.rejects(transfer,{code:'LINK_DELIVERY_IN_FLIGHT'});assert.equal(calls,1);release();assert.equal((await flight).ok,true);assert.equal((await transfer()).status,'linked');checks+=2;
 const g=await fixture(),proof=await readVerifiedTelegramBinding(g.pool,{email:A});const failure=await submitVerifiedTelegramBinding(g.pool,proof,{chatId},async()=>({ok:false}));assert.equal(failure.uncertain,true);await assert.rejects(await replacement(g),{code:'LINK_DELIVERY_IN_FLIGHT'});checks++;
 const h=await fixture(),source=await readVerifiedTelegramBinding(h.pool,{email:A});const reserved=await admitTelegramBindingDelivery(h.pool,source,{chatId});const persisted=await h.state();assert.equal(persisted['delivery:'+reserved.id].status,'reserved');assert(!JSON.stringify(persisted['delivery:'+reserved.id]).includes('accessKeyHash'));await assert.rejects(await replacement(h),{code:'LINK_DELIVERY_IN_FLIGHT'});checks++;
 if(!sql){const j=await fixture(),p=await readVerifiedTelegramBinding(j.pool,{email:A});j.failNext('commit-after');let count=0;const uncertain=await submitVerifiedTelegramBinding(j.pool,p,{chatId},async()=>{count++;return{ok:true};});assert.equal(count,0);assert.equal(uncertain.uncertain,true);await assert.rejects(await replacement(j),{code:'LINK_DELIVERY_IN_FLIGHT'});checks++;}
 const k=await fixture(),kp=await readVerifiedTelegramBinding(k.pool,{email:A});const finalized=await submitVerifiedTelegramBinding(k.pool,kp,{chatId},async()=>{k.failNext('commit-before');return{ok:true};});assert.equal(finalized.reason,'DELIVERY_FINALIZATION_UNCERTAIN');await assert.rejects(await replacement(k),{code:'LINK_DELIVERY_IN_FLIGHT'});checks++;
 const m=await fixture(),mp=await readVerifiedTelegramBinding(m.pool,{email:A}),ticket=await admitTelegramBindingDelivery(m.pool,mp,{chatId});const outcomes=await Promise.allSettled([finishTelegramBindingDelivery(m.pool,ticket.id,'accepted'),finishTelegramBindingDelivery(m.pool,ticket.id,'uncertain')]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='DELIVERY_OUTCOME_CONFLICT').length,1);checks++;
 console.log(`PASS durable Telegram admission (${sql?'isolated MySQL':'SQL double'}): ${checks} cases; active/unknown transfer block, terminal completion, concurrent provider, persisted reservation and ambiguous rejection; no real providers`);
}finally{if(sql)await sql.close();}
