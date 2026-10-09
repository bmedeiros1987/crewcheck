import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { companyTransportIntent } from '../shared/companyTransportIntent.mjs';
import { companyTransportReply, companyTransportOwner } from '../server/concierge/company-transport.mjs';
globalThis.fetch = () => assert.fail('No network');
const owner='fixture-owner@example.invalid';
const profile={email:owner,authenticated:true,channel:'app'};
const reference={schemaVersion:1,id:'fictional',operator:'Fictional operator',direction:'Alpha → Beta',timeZone:'America/Sao_Paulo',provenance:{label:'Fictional private source'},validity:{status:'unknown'},eligibility:{status:'confirmed',description:'Fictional eligible owner'},days:[1,2,3,4,5],exceptions:[{date:'2026-10-12',runs:false,note:'Fictional exception'}],stops:[{id:'a',label:'Alpha',boardingPoint:'Fictional gate A'},{id:'b',label:'Beta',boardingPoint:'Fictional gate B'}],trips:[[28800,30600],[90000,91800]]};
const entry={ownerEmail:owner,companyId:'fictional-company',accessScope:'private-company-transport',eligible:true,vehicleType:'bus',reference};
const catalogue={ownerEmail:owner,companyId:entry.companyId,accessScope:entry.accessScope,authorized:true,eligible:true,references:[entry]};
const full='ônibus da empresa de Alpha para Beta em 2026-10-09';
const deps={readAuthorizedCatalogue:async identity=>{assert.equal(identity,owner);return catalogue;}};
for(const text of ['/transporte_empresa','/transporte_empresa@FictionalBot','Ônibus e vans da empresa','ver ônibus','tem van da LATAM de Alpha para Beta em 2026-10-09','ônibus da empresa AAA→BBB em 2026-10-09'])assert.ok(companyTransportIntent(text),text);
for(const text of ['farmácia perto de mim','ônibus público para o aeroporto','van de turismo','hora da apresentação','valor da diária','cancelar','minha escala'])assert.equal(companyTransportIntent(text),null,text);
assert.equal((await companyTransportReply('farmácias',profile,deps)).handled,false);
for(const untrusted of [{},{...profile,authenticated:false},{...profile,visitor:true},{...profile,role:'visitante'},{...profile,channel:'whatsapp'},{...profile,channel:'telegram',linked:true,chatType:'group',chatId:'123'},{...profile,channel:'telegram',linked:false,chatType:'private',chatId:'123'}]){
 assert.equal(companyTransportOwner(untrusted),'');assert.match((await companyTransportReply(full,untrusted,{readAuthorizedCatalogue:()=>assert.fail('Must not read private catalogue')})).reply,/autenticado|visitantes/);
}
assert.equal(companyTransportOwner({...profile,channel:'telegram',linked:true,chatType:'private',chatId:'123'}),owner);
assert.match((await companyTransportReply('/transporte_empresa',profile,deps)).reply,/origem e o destino/);
assert.match((await companyTransportReply('ônibus da empresa de Alpha para Beta',profile,deps)).reply,/qual data/i);
assert.match((await companyTransportReply(full.replace('2026-10-09','2026-02-30'),profile,deps)).reply,/qual data/i);
assert.match((await companyTransportReply(full,profile)).reply,/ainda não está habilitado/);
assert.match((await companyTransportReply(full,profile,{readAuthorizedCatalogue:async()=>{throw Error('secret details');}})).reply,/falha não significa ausência/);
for(const wrong of [null,{...catalogue,ownerEmail:'other@example.invalid'},{...catalogue,eligible:false},{...catalogue,authorized:false},{...catalogue,accessScope:'public'}])assert.match((await companyTransportReply(full,profile,{readAuthorizedCatalogue:async()=>wrong})).reply,/autorização confirmada/);
for(const wrong of [{...entry,ownerEmail:'other@example.invalid'},{...entry,companyId:'other-company'},{...entry,eligible:false},{...entry,vehicleType:'unknown'},{...entry,reference:{...reference,eligibility:{status:'unknown',description:'unknown'}}}]){
 const reply=(await companyTransportReply(full,profile,{readAuthorizedCatalogue:async()=>({...catalogue,references:[wrong]})})).reply;assert.match(reply,/referência autorizada/);assert.doesNotMatch(reply,/08:00|Fictional private source/);
}
const reply=(await companyTransportReply(full,profile,deps)).reply;
for(const part of ['Ônibus da empresa','08:00','01:00 (+1 dia)','Fictional gate A','Fictional private source','data não informada','Vigência: não confirmada','Funcionamento em tempo real não confirmado','Não calculo chegada'])assert.ok(reply.includes(part),part);
assert.doesNotMatch(reply,/08:30|chegada garantida|van disponível|partidas ao vivo/i);
assert.match((await companyTransportReply(full.replace('ônibus','van'),profile,deps)).reply,/vans não estão confirmadas/);
assert.match((await companyTransportReply(full.replace('2026-10-09','2026-10-12'),profile,deps)).reply,/Sem partidas previstas/);
assert.match((await companyTransportReply(full.replace('Alpha para Beta','Beta para Alpha'),profile,deps)).reply,/referência autorizada/);
assert.match((await companyTransportReply(full,profile,{readAuthorizedCatalogue:async()=>({...catalogue,references:[entry,{...entry,reference:{...reference,id:'second'}}]})})).reply,/mais de uma referência/);
assert.match((await companyTransportReply(full, {...profile,email:'other@example.invalid'}, {readAuthorizedCatalogue:async()=>catalogue})).reply,/autorização confirmada/);
console.log('PASS natural intents, explicit route/date, private owner/company/eligibility guards, failures distinct, fictional schedule, no van inference, no arrival/APZ or GPS assumption.');

// Execute actual prepared wrapper, client helper and app endpoint, with fictional identity.
const server=fs.readFileSync(process.env.COMPANY_CONCIERGE_SERVER_SOURCE || 'server.mjs','utf8');
const home=fs.readFileSync(process.env.COMPANY_CONCIERGE_CLIENT_SOURCE || 'client/src/pages/Home.tsx','utf8');
assert.ok(server.includes("text: 'Ônibus e vans da empresa'"));assert.ok(home.includes("['/transporte_empresa', 'Ônibus e vans da empresa']"));
const extract=(source,name,tsx=false)=>{const ast=ts.createSourceFile('source',source,ts.ScriptTarget.Latest,true,tsx?ts.ScriptKind.TSX:ts.ScriptKind.JS);const node=ast.statements.find(item=>ts.isFunctionDeclaration(item)&&item.name?.text===name);assert.ok(node,name);return ts.transpileModule(node.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;};
const context={companyTransportReply,companyTransportIntent,console,
 conciergePreferenceCommandV14336:()=>assert.fail('Corporate intent must dispatch before general planner'),stayMenuReply:()=>assert.fail('Corporate intent must dispatch first'),
 loadFreshNearbyCurrentGeo:()=>assert.fail('Corporate query must not read cached GPS'),storage:{get:(_key,fallback)=>fallback},telegramConciergeIdentity:()=>({email:owner}),
 fetch:async(_url,options)=>{context.sent=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,reply:'fictional'})};},
 readJsonBody:async req=>req.body,telegramRequestUser:()=>profile,telegramAppRequestAllowed:()=>true,telegramLinkedRecordForEmail:async()=>null,
 conciergeLoadSnapshot:async()=>null,conciergeSaveSnapshotAsync:()=>assert.fail('GPS must not be persisted'),normalizeConciergeLocationV14335:()=>assert.fail('GPS must not be normalized'),
 conciergePreferencesV14336:()=>({}),conciergeVoiceOptionsV14336:()=>[],sendJson:(_res,status,payload)=>({status,payload})};
vm.createContext(context);vm.runInContext(extract(server,'buildTelegramConciergeReply')+extract(server,'handleTelegramConciergeAsk')+extract(home,'askTelegramConcierge',true),context);
for(const text of ['/transporte_empresa',full]){
 await context.askTelegramConcierge(text);assert.ok(!('location' in context.sent));
 const result=await context.handleTelegramConciergeAsk({method:'POST',body:{text,location:{latitude:1,longitude:2}}},{});assert.equal(result.status,200);assert.match(result.payload.reply,/origem e o destino|ainda não está habilitado/);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'company-concierge-patch-'));
try {
 fs.mkdirSync(path.join(temp,'client/src/pages'),{recursive:true});fs.writeFileSync(path.join(temp,'server.mjs'),server);fs.writeFileSync(path.join(temp,'client/src/pages/Home.tsx'),home);
 const apply=path.resolve('scripts/concierge-company-transport/apply.mjs');execFileSync(process.execPath,[apply],{cwd:temp});execFileSync(process.execPath,[apply],{cwd:temp});assert.equal(fs.readFileSync(path.join(temp,'server.mjs'),'utf8'),server);assert.equal(fs.readFileSync(path.join(temp,'client/src/pages/Home.tsx'),'utf8'),home);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS actual menu/wrapper/client/endpoint: no GPS read/transmission/normalization/persistence, no route planner, idempotent patch, no network.');
