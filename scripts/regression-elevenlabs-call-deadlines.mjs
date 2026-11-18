import assert from 'node:assert/strict';
import fs from 'node:fs';
import {startInfobipElevenLabsCall,handleInfobipCallsEvent} from '../server/v14405/infobip-elevenlabs.mjs';
globalThis.fetch=()=>{throw Error('External network forbidden');};
const environment={INFOBIP_API_KEY:'synthetic',INFOBIP_BASE_URL:'https://fixture.api.infobip.com',INFOBIP_PHONE_FROM:'12025550100',ELEVENLABS_API_KEY:'synthetic',ELEVENLABS_TTS_VOICE_ID:'synthetic-voice'};
const timeouts={synthesis:12,upload:12,call:12,action:12};
let sequence=0;
const stage=url=>String(url).includes('api.elevenlabs.io')?'synthesis':String(url).endsWith('/file/upload')?'upload':String(url).endsWith('/calls/1/calls')?'call':String(url).endsWith('/play')?'play':'hangup';
const reply=(phase,id)=>phase==='synthesis'?new Response(new Uint8Array([73,68,51,4])):Response.json(phase==='upload'?{fileId:'synthetic-file'}:phase==='call'?{id}:{status:'IN_PROGRESS'});
function transport(block,body=false){
 const id='synthetic-call-'+(++sequence),attempts=[];let release;
 const fetchImpl=async(url,options)=>{
  const phase=stage(url);attempts.push(phase);assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);
  if(phase===block){
   if(body)return new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}}));
   return new Promise(resolve=>release=()=>resolve(reply(phase,id))); // deliberately ignores abort
  }
  return reply(phase,id);
 };
 return {id,attempts,fetchImpl,release:()=>release?.()};
}
for(const phase of ['synthesis','upload','call'])for(const body of [false,true]){
 const fake=transport(phase,body),started=Date.now();
 const outcome=await startInfobipElevenLabsCall('12025550101','Synthetic only',{environment,fetchImpl:fake.fetchImpl,timeouts});
 assert.equal(outcome.ok,false);assert.equal(outcome.configured,true);assert.equal(outcome.uncertain,true);assert(Date.now()-started<2000);
 assert.deepEqual(fake.attempts,['synthesis','upload','call'].slice(0,['synthesis','upload','call'].indexOf(phase)+1));
 fake.release();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(await handleInfobipCallsEvent({type:'CALL_ESTABLISHED',callId:fake.id},{fetchImpl:()=>assert.fail('late ACK must not register a job')}),{ok:true,handled:0});
}
for(const phase of ['synthesis','upload']){
 const fake=transport();const fetchImpl=async(url,options)=>stage(url)===phase?new Response(new Uint8Array(phase==='synthesis'?4*1024*1024+1:65537)):fake.fetchImpl(url,options);
 const result=await startInfobipElevenLabsCall('12025550101','Synthetic',{environment,fetchImpl,timeouts});assert.equal(result.ok,false);assert.equal(result.uncertain,true);assert(!fake.attempts.includes('call'));
}
// Play and hangup are separately bounded. Concurrent/replayed events do not retry.
for(const action of ['play','hangup'])for(const body of [false,true]){
 const fake=transport(action,body);assert.equal((await startInfobipElevenLabsCall('12025550101','Synthetic',{environment,fetchImpl:fake.fetchImpl,timeouts})).ok,true);
 const event={type:action==='play'?'CALL_ESTABLISHED':'PLAY_FINISHED',callId:fake.id};
 const results=await Promise.all([handleInfobipCallsEvent(event,{fetchImpl:fake.fetchImpl,timeouts}),handleInfobipCallsEvent(event,{fetchImpl:fake.fetchImpl,timeouts})]);
 assert(results.some(result=>result.uncertain===1));assert.equal(fake.attempts.filter(value=>value===action).length,1);
 await handleInfobipCallsEvent(event,{fetchImpl:fake.fetchImpl,timeouts});assert.equal(fake.attempts.filter(value=>value===action).length,1);
 fake.release();await new Promise(resolve=>setImmediate(resolve));await handleInfobipCallsEvent({type:'CALL_FINISHED',callId:fake.id});
}
if(process.argv.includes('--prepared')){
 // Execute the real generated scheduler and manual wrappers against the actual
 // private module, with synthetic timeouts; a lost ACK cannot start native TTS.
 const fast=fs.readFileSync('server/telegram-fast-ack.mjs','utf8');
 const scheduler=fast.match(/async function sendInfobipPhone\(phone, message(?:, \{ locale \} = \{\})?\) \{[\s\S]*?\n\}/)?.[0];
 const server=fs.readFileSync('server.mjs','utf8');
 const manual=server.slice(server.indexOf('async function sendInfobipPhoneCall('),server.indexOf('async function sendAdminPhoneCall('));
 assert(scheduler?.includes('privateCall.configured'));assert(manual.includes('privateCall.configured'));
 for(const phase of ['synthesis','upload','call']){
  let nativeCalls=0,privateCalls=0;const fake=transport(phase);
  const privateCall=async(phone,text)=>{privateCalls++;return startInfobipElevenLabsCall(phone,text,{environment,fetchImpl:fake.fetchImpl,timeouts});};
  const native=async()=>{nativeCalls++;return {ok:true};};
  const selected=new Function('sendInfobipWakeupCall','infobipElevenLabsAudioEnabled','startInfobipElevenLabsCall','wakeupPrivateModelSupportsLocale',`return (${scheduler});`)(native,()=>true,privateCall,()=>true);
  assert.equal((await selected('12025550101','Synthetic')).uncertain,true);assert.equal(nativeCalls,0);assert.equal(privateCalls,1);fake.release();
  const fake2=transport(phase);privateCalls=0;
  const manualSelected=new Function('buildInfobipTtsRequest','cleanVoiceCallText','infobipElevenLabsAudioEnabled','startInfobipElevenLabsCall','fetchVoiceProvider',`let infobipLastAttempt; return (${manual});`)(()=>({ok:true,body:{messages:[{}]}}),text=>text,()=>true,async(phone,text)=>{privateCalls++;return startInfobipElevenLabsCall(phone,text,{environment,fetchImpl:fake2.fetchImpl,timeouts});},native);
  assert.equal((await manualSelected('12025550101','Synthetic')).uncertain,true);assert.equal(nativeCalls,0);assert.equal(privateCalls,1);fake2.release();
 }
}
console.log(JSON.stringify({suite:'private voice deadlines',prepared:process.argv.includes('--prepared'),phases:['synthesis','upload','call','play','hangup'],stalledBodies:true,ignoredAbortAndLateAck:true,responseLimits:true,concurrentCallbacks:true,externalCalls:0}));
