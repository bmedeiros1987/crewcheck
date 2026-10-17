import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { stayMenuIntent, privateStayMenuOwner, readStayMenuHistory, stayMenuReply } from '../server/concierge/stay-menu.mjs';
import { companyTransportReply } from '../server/concierge/company-transport.mjs';

for (const text of ['🏨 Hotéis', '🏨 Meu pernoite', '/hoteis', '/hoteis@CrewCheckBot', '/hotel teste', 'meu pernoite']) assert.equal(stayMenuIntent(text)?.kind, 'menu');
for (const text of ['Informar hotel', 'registrar o pernoite', '/registrar_pernoite']) assert.equal(stayMenuIntent(text)?.kind, 'hotel');
assert.equal(stayMenuIntent('Adicionar quarto')?.kind, 'room');
assert.deepEqual(stayMenuIntent('Histórico de pernoites'), {kind:'history',page:1});
assert.deepEqual(stayMenuIntent('/historico_pernoites@CrewCheckBot 2'), {kind:'history',page:2});
assert.equal(stayMenuIntent('/historico_pernoites 999').page, 24);
for (const text of ['referência: Hotel Teste, Recife', 'farmácias perto do hotel', 'hospitais', '1', 'quarto 302', 'hotel: Teste', 'registrar pernoite hotel Teste quarto 302']) assert.equal(stayMenuIntent(text), null);

const email = 'fixture@example.test';
const telegram = { email, channel:'telegram', chatType:'private', chatId:'123', linked:true };
const app = { email, channel:'app', authenticated:true };
const whatsapp = { email, channel:'whatsapp', linked:true };
for (const profile of [telegram,app,whatsapp]) assert.equal(privateStayMenuOwner(profile),email);
for (const profile of [{}, {...telegram,chatType:'group'}, {...telegram,chatType:'supergroup'}, {...telegram,chatType:''}, {...telegram,chatId:'-123'}, {...telegram,linked:false}, {...telegram,email:'telegram:123'}, {...app,authenticated:false}, {...app,authenticated:undefined,linked:true,chatId:'123'}, {...whatsapp,linked:false}, {...whatsapp,channel:'unknown'}]) {
  assert.equal(privateStayMenuOwner(profile),'');
  const result = await stayMenuReply('Histórico de pernoites', profile, { readHistory: () => assert.fail('must not read history for unverified/private transport') });
  assert.match(result.reply,/conversa privada/);
}

const records = [
  {date:'2026-10-02',hotel:'Hotel Teste',airport:'REC',room:'SECRET-302',presentationTime:'06:00'},
  {date:'2026-07-30',hotel:'Hotel Antigo',airport:'GRU',room:'OLD-909'},
];
const history = async (owner,page) => { assert.equal(owner,email);assert.ok(page>=1);return {records,hasMore:true}; };
for (const profile of [telegram,app,whatsapp]) {
  const result = await stayMenuReply('Histórico de pernoites',profile,{readHistory:history});
  assert.match(result.reply,/02\/10\/2026 · Hotel Teste · REC/);
  assert.match(result.reply,/30\/07\/2026 · Hotel Antigo · GRU/);
  assert.match(result.reply,/historico_pernoites 2/);
  assert.doesNotMatch(result.reply,/SECRET|OLD-909|06:00|PERNOITE ATUAL|Apresentação\/saída/);
  assert.match(result.reply,/não confirma onde você está agora/);
}
const noRead = {readHistory:()=>assert.fail('menu/handoff may not read database')};
assert.match((await stayMenuReply('🏨 Hotéis',telegram,noRead)).reply,/Meu pernoite/);
for (const text of ['Informar hotel','Adicionar quarto']) {
  const result=await stayMenuReply(text,telegram,noRead);
  assert.match(result.reply,/cadastro por esta conversa ainda não está disponível/);
  assert.match(result.reply,/Salvar hotel/);
  assert.doesNotMatch(result.reply,/hotel salvo|quarto salvo|https?:|\?view=/i);
}
assert.equal((await stayMenuReply('farmácias',telegram,noRead)).handled,false);
assert.match((await stayMenuReply('Histórico de pernoites',app,{readHistory:async()=>{throw Error('private database details');}})).reply,/Não consegui consultar/);
assert.doesNotMatch((await stayMenuReply('Histórico de pernoites',app,{readHistory:async()=>{throw Error('private database details');}})).reply,/private database/);
assert.match((await stayMenuReply('Histórico de pernoites',app,{readHistory:async()=>({records:[]})})).reply,/ainda não tem pernoites/);

let query;
const getPool=async()=>({query:async(sql,args)=>{query={sql,args};return [[...Array.from({length:6},(_,i)=>({stay_date:i===0?'2026-10-02':'2026-07-30',hotel_name:`Hotel ${i}`,airport:'REC',room_cipher:'do-not-read'}))]];}});
for (const zone of ['UTC','America/Manaus','Pacific/Kiritimati']) {
  process.env.TZ=zone;
  const result=await readStayMenuHistory(email,2,getPool);
  assert.equal(result.records[0].date,'2026-10-02');
  assert.equal(result.records.length,5);assert.equal(result.hasMore,true);
  assert.deepEqual(query.args,[email,6,5]);
  assert.match(query.sql,/WHERE owner_email=\?/);assert.match(query.sql,/DATE_FORMAT/);
  assert.doesNotMatch(query.sql,/room|presentation|SELECT \*|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.deepEqual(Object.keys(result.records[0]),['date','hotel','airport']);
}
await assert.rejects(()=>readStayMenuHistory('invalid',1,getPool),/OWNER_REQUIRED/);

// Execute the actual preparation patch on the real checked-in transport code,
// with the final wrapper materialized from its tracked template. In full CI it
// also verifies the fully prepared server retains the same integration.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-stay-menu-'));
try {
  fs.mkdirSync(path.join(temp,'server/v1391'),{recursive:true});
  let server=fs.readFileSync('server.mjs','utf8');
  if(!server.includes('async function buildTelegramConciergeReplyCore(')) {
    const start=server.indexOf("async function buildTelegramConciergeReply(text = '', profile = {}, snapshot = null) {");
    const end=server.indexOf('\nasync function ',start+10);
    assert.ok(start>=0 && end>start);
    server=server.slice(0,start)+fs.readFileSync('scripts/v14408/reply-wrapper.snippet','utf8')+server.slice(end);
  }
  fs.writeFileSync(path.join(temp,'server.mjs'),server);
  fs.copyFileSync('server/v1391/emergency.mjs',path.join(temp,'server/v1391/emergency.mjs'));
  const apply=path.resolve('scripts/p1-concierge-stay-menu/apply.mjs');
  execFileSync(process.execPath,[apply],{cwd:temp});
  const once=fs.readFileSync(path.join(temp,'server.mjs'),'utf8');
  const emergencyOnce=fs.readFileSync(path.join(temp,'server/v1391/emergency.mjs'),'utf8');
  execFileSync(process.execPath,[apply],{cwd:temp});
  assert.equal(fs.readFileSync(path.join(temp,'server.mjs'),'utf8'),once);
  assert.equal(fs.readFileSync(path.join(temp,'server/v1391/emergency.mjs'),'utf8'),emergencyOnce);
  execFileSync(process.execPath,['--check',path.join(temp,'server.mjs')]);
  execFileSync(process.execPath,['--check',path.join(temp,'server/v1391/emergency.mjs')]);
  assert.match(once,/text: '🏨 Meu pernoite'/);
  assert.match(once,/\{ \.\.\.profile, channel: 'app' \}, snapshot\)/);
  const wrapper=once.slice(once.indexOf("async function buildTelegramConciergeReply(text = ''"),once.indexOf('\nasync function ',once.indexOf("async function buildTelegramConciergeReply(text = ''")+10));
  const context=vm.createContext({companyTransportReply,stayMenuReply,conciergePreferenceCommandV14336:()=>assert.fail('exact stay menu must dispatch first')});
  vm.runInContext(`${wrapper}\nglobalThis.run=buildTelegramConciergeReply;`,context);
  assert.match(await context.run('Meu pernoite',telegram),/Meu pernoite/);
  assert.match(await context.run('Informar hotel',telegram),/cadastro por esta conversa/);
  // Legacy early route must release exact hotel/menu/history requests before
  // reading the emergency database, but keep emergency handling untouched.
  const start=emergencyOnce.indexOf('export async function handleEmergencyTelegram(');
  const end=emergencyOnce.indexOf('\nexport const emergencyCatalog',start);
  const legacy=vm.createContext({flag:()=>true,stayMenuIntent,dbPool:()=>assert.fail('legacy hotel dump reached')});
  vm.runInContext(emergencyOnce.slice(start,end).replace('export async','async')+'\nglobalThis.run=handleEmergencyTelegram;',legacy);
  for(const text of ['🏨 Hotéis','/hoteis@CrewCheckBot','/hotel teste','Histórico de pernoites','Adicionar quarto']) assert.equal(await legacy.run({message:{chat:{id:123,type:'private'},text}},()=>assert.fail('legacy sender reached')),false);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
assert.match(fs.readFileSync('scripts/v139/apply.mjs','utf8'),/p1-concierge-stay-menu\/apply\.mjs/);
console.log('PASS: stay menu, compact history, 3 trusted channels, private-chat guards, DATE timezone stability, no room reads/writes, prepared routing and idempotence');
