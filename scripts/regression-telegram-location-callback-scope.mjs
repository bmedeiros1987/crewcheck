import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('server.mjs','utf8');
function extract(name) {const start=source.indexOf(`async function ${name}(`);assert(start>=0);const end=source.indexOf('\n}\n',start)+3;assert(end>start);return source.slice(start,end);}
async function locationFixture(fnSource,{silent=false,valid=true}={}) {
  const saved=[],sent=[];
  const deps={telegramProfileForChatAsync:async()=>({email:'fixture@example.invalid',linked:true}),resolveConciergeLocationLabelV14335:async value=>({...value,label:'Synthetic location'}),mapsServerKey:()=>'',WEATHER_AIRPORT_POINTS:{},normalizeConciergeLocationV14335:value=>valid?value:null,conciergeSaveSnapshotAsync:async(...args)=>saved.push(args),sendTelegramMessage:async(...args)=>sent.push(args),conciergeKeyboard:{}};
  const fn=new Function(...Object.keys(deps),`${fnSource};return handleTelegramLocation;`)(...Object.values(deps));
  const result=await fn({chat:{id:'synthetic_chat'},location:{latitude:1,longitude:2}},{silent});
  return {result,saved,sent};
}
const locationSource=extract('handleTelegramLocation');
for(const silent of [false,true]){const value=await locationFixture(locationSource,{silent});assert.equal(value.result,true);assert.equal(value.saved.length,1);assert.equal(value.sent.length,silent&&locationSource.includes('silent = false')?0:1);assert(!value.sent.some(args=>args[1].includes('CallMeBot')));}
if(locationSource.includes('normalizeConciergeLocationV14335'))assert.equal((await locationFixture(locationSource,{valid:false})).saved.length,0);
assert.doesNotMatch(locationSource,/data\.linked\[email\]/);
const linkSource=extract('telegramTryBindFromWebhook');
if(source.includes('callMeBotOnboardingVersion: 2')) {
  assert.match(linkSource,/data\.linked\[email\]\.username/);
  for(const username of ['fixture_user','']) {
    const sent=[],data={pending:{cc_SYNTHETIC:{email:'fixture@example.invalid'}},linked:{}};
    const deps={telegramLinksRead:()=>data,conciergeDbGet:async()=>null,sendTelegramMessage:async(...args)=>sent.push(args),telegramLinksWrite:()=>{},conciergeDbPut:async()=>{},conciergeDbDelete:async()=>{},conciergeMergeChatSnapshot:async()=>{},conciergeSaveSnapshotAsync:async()=>{},normalizeTelegramUsername:value=>value,DEFAULT_CONCIERGE_NAME:'Synthetic',conciergeKeyboard:{},callMeBotAuthorizationKeyboard:()=>({fixture:true})};
    const fn=new Function(...Object.keys(deps),`${linkSource};return telegramTryBindFromWebhook;`)(...Object.values(deps));
    assert.equal(await fn({chat:{id:'synthetic_chat'},from:{username}},'/start cc_SYNTHETIC'),true);
    assert.equal(sent.filter(args=>String(args[1]).includes('CallMeBot')).length,username?1:0);
  }
}
console.log('PASS actual Telegram location and link handlers: linked valid/silent/invalid locations, no misplaced invitation, new-link username-bound invitation; mock persistence/messages only, zero network.');
export {locationFixture};
