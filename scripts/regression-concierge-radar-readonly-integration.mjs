import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { radarReadReply, radarReadIntent } from '../server/concierge/radar-readonly.mjs';
const transportModule = fs.existsSync('server/concierge/company-transport.mjs') ? await import('../server/concierge/company-transport.mjs') : null;
const transportIntentModule = fs.existsSync('shared/companyTransportIntent.mjs') ? await import('../shared/companyTransportIntent.mjs') : null;
const source=fs.readFileSync('server.mjs','utf8');
const start=source.indexOf("async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {");
const end=source.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start);
const code=source.slice(start,end);
assert.match(code,/const savedRadar = await radarReadReply/);
let reads=0;
const context=vm.createContext({radarReadReply:(text,profile,snapshot)=>radarReadReply(text,profile,snapshot,{read:async owner=>{reads++;assert.equal(owner,'a@example.invalid');return [];} }),
  ...(transportModule ? {companyTransportReply:transportModule.companyTransportReply} : {}),
  fetch:()=>{throw Error('NETWORK_FORBIDDEN');},runRadarRace:()=>{throw Error('PROVIDER_FORBIDDEN');},
  conciergeSaveSnapshotAsync:()=>{throw Error('WRITE_FORBIDDEN');},
  stayMenuReply:async()=>({handled:false}),conciergeCommandIntentV14407:()=>{throw Error('SEMANTIC_REWRITE_FORBIDDEN');}});
vm.runInContext(code+'\nthis.reply=buildTelegramConciergeReply;',context);
const profile={email:'a@example.invalid',channel:'app',authenticated:true};
assert.match(await context.reply('/radar LA1234 2026-10-09',profile,null),/Não há informação salva/);
assert.equal(reads,1);
assert.match(await context.reply('Qual o status do voo 1234?',profile,null),/companhia/);
assert.equal(reads,1,'no inferred airline/provider call');
assert.match(await context.reply('/voos_seguidos',{...profile,visitorId:'v',permissions:{radar:true}},null),/privada/);
assert.equal(reads,1);
console.log('PASS actual prepared Concierge wrapper intercepts original flight/date text before semantic rewriting; no provider/write/GPS; visitor denied before DB');

function actualFunction(name) {
  const start=source.indexOf(`async function ${name}(`)>=0 ? source.indexOf(`async function ${name}(`) : source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing ${name}`);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
let response, normalizations=0, writes=0;
let endpointBody={text:'/radar LA1234 2026-10-09',location:{latitude:-23,longitude:-46},preferences:{location:{latitude:-23,longitude:-46},gymPlan:'wellhub'}};
const wrapperInputs=[];
const snapshot={email:profile.email,roster:{days:[]}};
const endpoint=vm.createContext({
  readJsonBody:async()=>endpointBody,
  telegramRequestUser:()=>profile,telegramAppRequestAllowed:()=>true,
  telegramLinkedRecordForEmail:async()=>null,conciergeAccessMatches:()=>true,conciergeLoadSnapshot:async()=>snapshot,
  radarReadReply:context.radarReadReply,
  ...(transportIntentModule ? {companyTransportIntent:transportIntentModule.companyTransportIntent} : {}),
  normalizeConciergeLocationV14335:()=>{normalizations++;throw Error('GPS_NORMALIZATION_FORBIDDEN');},
  WEATHER_AIRPORT_POINTS:{},
  conciergeSaveSnapshotAsync:()=>{writes++;throw Error('WRITE_FORBIDDEN');},
  buildTelegramConciergeReply:async(text,p,s)=>{wrapperInputs.push(text);return transportModule ? context.reply(text,p,s) : 'FIXTURE_CORPORATE_PATH';},
  conciergePreferencesV14336:()=>({}),conciergeVoiceOptionsV14336:()=>[],
  sendJson:(_res,status,payload)=>{response={status,payload};},
});
vm.runInContext(actualFunction('handleTelegramConciergeAsk'),endpoint);
await endpoint.handleTelegramConciergeAsk({method:'POST'},{});
assert.equal(response.status,200);assert.match(response.payload.reply,/Não há informação salva/);
assert.equal(normalizations,0);assert.equal(writes,0);
assert.equal(wrapperInputs.length,0,'Radar returns before generic wrapper and effects');
const beforeCorporateReads=reads;
for(const text of ['van da LATAM no portão B12 em 2026-10-09','ônibus LATAM no terminal C3 em 2026-10-09','van intersites no portão B12 em 2026-10-09','transporte intersites no terminal C3 em 2026-10-09','/transporte_empresa@fixture_bot portão B12 em 2026-10-09']) {
  endpointBody={text,...(transportModule ? {location:{latitude:-23,longitude:-46}} : {})};
  await endpoint.handleTelegramConciergeAsk({method:'POST'},{});
  assert.equal(response.status,200);assert.equal(wrapperInputs.at(-1),text);
  assert.equal(reads,beforeCorporateReads,'gate code in corporate request must never reach Radar DB');
  assert.match(response.payload.reply,transportModule ? /origem|destino|transporte|empresa/i : /FIXTURE_CORPORATE_PATH/);
  assert.doesNotMatch(response.payload.reply,/companhia e o número|Não há informação salva confirmada/);
}
assert.equal(normalizations,0);assert.equal(writes,0);

// Run the prepared app helper. Radar must return before any GPS/cache getter.
const client=fs.readFileSync('client/src/pages/Home.tsx','utf8');
const clientStart=client.indexOf('async function askTelegramConcierge(text: string) {');
assert.ok(clientStart>=0);
const clientCode=client.slice(clientStart,client.indexOf('\n}',clientStart)+2).replace('text: string','text');
let appBody, preferenceReads=0;
const clientContext=vm.createContext({radarReadIntent,
  ...(transportIntentModule ? {companyTransportIntent:transportIntentModule.companyTransportIntent} : {}),
  telegramConciergeIdentity:()=>({email:profile.email}),
  loadFreshNearbyCurrentGeo:()=>{throw Error('GPS_CACHE_FORBIDDEN');},
  storage:{get:(_key,fallback)=>{preferenceReads++;return fallback;}},
  navigator:{geolocation:{getCurrentPosition:()=>{throw Error('GPS_REQUEST_FORBIDDEN');}}},
  fetch:async(url,options)=>{assert.equal(url,'/api/telegram/concierge/ask');appBody=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,reply:'fixture'})};},
});
vm.runInContext(clientCode,clientContext);
for(const text of ['/radar LA1234 2026-10-09','/voos_seguidos','Qual o status do voo 1234?']) {
  await clientContext.askTelegramConcierge(text);assert.deepEqual(appBody,{email:profile.email,text});
}
assert.equal(preferenceReads,0,'Radar must not read unrelated preferences');

// Execute actual Telegram input normalization, process entry and wrapper.
let sent, receivedText;
const telegram=vm.createContext({
  handleTelegramWeatherCallback:async()=>false,handleTelegramCallCallback:async()=>false,
  handlePlatformVisitorTelegram:async()=>false,telegramTryBindFromWebhook:async()=>false,
  telegramMessagePdfDocument:()=>null,telegramProfileForChatAsync:async()=>({...profile,channel:'telegram',linked:true,chatType:'private',chatId:'123'}),
  conciergeLoadSnapshot:async()=>snapshot,sendTelegramChatAction:async()=>{},
  buildTelegramConciergeReply:async(text,p,s)=>{receivedText=text;return context.reply(text,p,s);},
  conciergeNextProgram:()=>null,airportIcao:()=>'',conciergeReplyKeyboard:()=>({}),
  sendTelegramMessage:async(_chat,reply)=>{sent=reply;},
});
vm.runInContext([actualFunction('normalizeCrewCheckNaturalLanguage'),actualFunction('normalizeConciergeButtonText'),actualFunction('processTelegramUpdate')].join('\n'),telegram);
for(const text of ['/radar LA1234 2026-10-09','Qual o portão do voo LA1234 em 09/10/2026?']) {
  await telegram.processTelegramUpdate({message:{text,chat:{id:123,type:'private'},message_id:1,date:1}});
  assert.equal(receivedText,text);assert.match(sent,/Não há informação salva/);
}
for(const button of ['🛫 Radar / portão','Radar','Portão']) assert.equal(telegram.normalizeConciergeButtonText(button),'/radar');
assert.equal(telegram.normalizeConciergeButtonText('ônibus da empresa no portão 2'),'ônibus da empresa no portão 2');
if(transportModule) {
  assert.match(await context.reply('ônibus da empresa do terminal 1 para terminal 2 em 2026-10-09',profile,null),/transporte|origem|destino|empresa/i);
  await clientContext.askTelegramConcierge('ônibus da empresa do terminal 1 para terminal 2 em 2026-10-09');
  assert.equal('location' in appBody,false);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'radar-transport-finalizers-'));
  try {
    fs.mkdirSync(path.join(temporary,'client/src/pages'),{recursive:true});
    fs.writeFileSync(path.join(temporary,'server.mjs'),source);
    fs.writeFileSync(path.join(temporary,'client/src/pages/Home.tsx'),client);
    for(const script of ['scripts/concierge-radar-readonly/apply.mjs','scripts/concierge-company-transport/apply.mjs','scripts/concierge-radar-readonly/apply.mjs','scripts/concierge-company-transport/apply.mjs']) execFileSync(process.execPath,[path.resolve(script)],{cwd:temporary});
    assert.equal(fs.readFileSync(path.join(temporary,'server.mjs'),'utf8'),source,'alternating adapters must preserve composed server');
    assert.equal(fs.readFileSync(path.join(temporary,'client/src/pages/Home.tsx'),'utf8'),client,'alternating adapters must preserve composed client');
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
console.log('PASS actual app endpoint rejects location/preferences effects, client omits GPS, Telegram entry preserves flight/date and exact buttons; optional real transport composition');
