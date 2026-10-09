import assert from 'node:assert/strict';
import { radarReadIntent,radarReadOwner,radarCivilDate,readFollowedRadar,radarReadReply } from '../server/concierge/radar-readonly.mjs';
globalThis.fetch = async () => { throw new Error('NETWORK_FORBIDDEN'); };
const owner = {channel:'app',authenticated:true,email:'a@example.invalid'};
const row = {flight:'LA1234',date:'2026-10-09',checkedAt:'2026-10-09T01:00:00Z',snapshot:{ok:true,flight:'LA1234',operationalDate:'2026-10-09',source:'Fixture Radar',status:'Atrasado',gate:'A1',departure:'10:10',delayMinutes:10}};
let reads=0;
const deps = {read:async(email,intent)=>{reads++;assert.equal(email,owner.email);return [row];}};
assert.equal(radarCivilDate('2026-02-30'),'');
assert.equal(radarReadIntent('Como pegar o ônibus?'),null);
for (const text of ['ônibus da empresa do terminal 1 para terminal 2 em 2026-10-09', 'van da empresa no portão 2', 'ônibus da empresa no gate G31234', 'qual terminal do hotel?', 'portão do ônibus']) assert.equal(radarReadIntent(text),null);
assert.equal(radarReadIntent('terminal do voo LA1234 em 2026-10-09').flight,'LA1234');
for (const text of ['status do meu plano','informações do hotel','qual a próxima programação','meu próximo voo','horário da van']) assert.equal(radarReadIntent(text),null);
assert.equal(radarReadIntent('status do voo 1234').flight,'','never infer LATAM');
assert.equal(radarReadIntent('/radar LAN1234 09/10/2026').flight,'LA1234');
assert.equal(radarReadIntent('/radar 2Z123 2026-10-09').flight,'2Z123');
for(const p of [{...owner,authenticated:false},{...owner,visitorId:'v',permissions:{radar:true}},{...owner,ownerEmail:owner.email},{...owner,role:'visitor'},{...owner,channel:'whatsapp'}, {...owner,channel:'telegram',linked:true,chatType:'group',chatId:'123'}]) {
 assert.equal(radarReadOwner(p),'');await radarReadReply('/voos_seguidos',p,null,deps);
}
assert.equal(reads,0);
assert.equal(radarReadOwner({...owner,channel:'telegram',linked:true,chatType:'private',chatId:'123'}),owner.email);
for(const text of ['/radar LA1234','status voo 1234','/radar LA1234 2026-02-30','/radar LA1234 G31234 2026-10-09','/radar LA1234 2026-10-09 2026-10-10']) {
 assert.equal((await radarReadReply(text,owner,null,deps)).handled,true);
}
assert.equal(reads,0,'clarify before any DB or provider access');
const reply=(await radarReadReply('Qual o status do voo LA1234 em 09/10/2026?',owner,null,deps)).reply;
assert.match(reply,/Fixture Radar/);assert.match(reply,/Última atualização: 2026-10-09T01:00:00Z/);assert.match(reply,/Atrasado/);assert.match(reply,/Portão: A1/);assert.match(reply,/10 min/);assert.doesNotMatch(reply,/Chegada|Terminal/);assert.match(reply,/não confirma.*ao vivo/);
assert.match((await radarReadReply('/voos_seguidos',owner,null,deps)).reply,/LA1234.*2026-10-09/);
for (const delayMinutes of ['',true,null,undefined,-1]) assert.doesNotMatch((await radarReadReply('/radar LA1234 2026-10-09',owner,null,{read:async()=>[{...row,snapshot:{...row.snapshot,delayMinutes}}]})).reply,/Atraso informado/);
assert.match((await radarReadReply('/radar LA1234 2026-10-10',owner,null,deps)).reply,/Não há informação salva/);
assert.match((await radarReadReply('/radar LA1234 2026-10-09',owner,{email:'b@example.invalid',lastRadar:row.snapshot},{read:async()=>[]})).reply,/Não há informação salva/);
assert.match((await radarReadReply('/radar LA1234 2026-10-09',owner,{email:owner.email,lastRadar:row.snapshot},{read:async()=>[]})).reply,/Fixture Radar/);
for(const snapshot of [{...row.snapshot,ok:false},{...row.snapshot,flight:'G31234'},{...row.snapshot,operationalDate:'2026-10-10'}]) {
 assert.match((await radarReadReply('/radar LA1234 2026-10-09',owner,null,{read:async()=>[{...row,snapshot}]})).reply,/Não há informação salva/);
}
let query;
const pool=async()=>({query:async(sql,params)=>{query={sql,params};return [[{owner_email:owner.email,flight_number:row.flight,flight_date:row.date,last_snapshot:JSON.stringify(row.snapshot),last_checked_at:row.checkedAt},{owner_email:'b@example.invalid',flight_number:'G39999',flight_date:row.date}]];}});
assert.equal((await readFollowedRadar(owner.email,{flight:row.flight,date:row.date},pool)).length,1);
assert.match(query.sql,/WHERE owner_email=\?/);assert.match(query.sql,/flight_number IN/);assert.deepEqual(query.params,[owner.email,'LA1234','LAN1234',row.date]);
assert.match((await radarReadReply('/voos_seguidos',owner,null,{read:async()=>{throw Error('unavailable');}})).reply,/Nenhuma consulta externa/);
console.log('PASS saved Radar read-only: actual owner-scoped SQL, dates/airline ambiguity, A/B isolation, visitor denial, timestamps/source and missing fields, no external calls or writes');
