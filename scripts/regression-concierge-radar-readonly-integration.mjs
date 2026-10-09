import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { radarReadReply } from '../server/concierge/radar-readonly.mjs';
const source=fs.readFileSync('server.mjs','utf8');
const start=source.indexOf("async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {");
const end=source.indexOf('\n}',start)+2;
assert.ok(start>=0&&end>start);
const code=source.slice(start,end);
assert.match(code,/const savedRadar = await radarReadReply/);
let reads=0;
const context=vm.createContext({radarReadReply:(text,profile,snapshot)=>radarReadReply(text,profile,snapshot,{read:async owner=>{reads++;assert.equal(owner,'a@example.invalid');return [];} }),
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
