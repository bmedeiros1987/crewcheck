import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {operationalQuestion as classify} from '../server/concierge/operational-question.mjs';
import {stayMenuIntent,stayMenuReply} from '../server/concierge/stay-menu.mjs';
import {interpretConciergeNaturalTextV14341 as interpret} from '../server/v14341/concierge-semantic.mjs';
let calls=0;globalThis.fetch=()=>{calls++;throw Error('NO_NETWORK');};
const fixtures=[['q hrs a van me pega no hotel?','pickup'],['quando saio do hotel?','hotel-time'],['q horas me apresento no hotel?','hotel-time'],['qual minha APZ?','apz'],['APZ do HOTEL?','hotel-time'],['em que hotel vou ficar?','hotel'],['até q hrs posso esperar a van?','wait'],['qual telefone do transfer?','contact'],['qual a saída da van do aeroporto para o hotel?','pickup']];
let reads=0;for(const [text,subject]of fixtures){assert.equal(classify(text)?.subject,subject,text);assert.equal(stayMenuIntent(text)?.subject,subject,text);const result=await stayMenuReply(text,{email:'synthetic@example.test',channel:'whatsapp',linked:true},{readHistory(){reads++;throw Error('NO_HISTORY');}});assert(result.handled);assert.match(result.reply,/não|quer|confirme|qual|apresentação/i);}
for(const [text,intent]of [['qual minha próxima jornada?','next'],['qual meu prox serviço?','next'],['quando é minha proximaa atividade?','next'],['como ta minha escala?','summary'],['me mostra minha escala','summary'],['q hrs me apresento?','presentation'],['qual minha APZ no aeroporto?','presentation']])assert.equal(interpret(text,null,new Date('2032-10-10T15:00:00-03:00')).intent,intent,text);
for(const text of ['salvar hotel','cadastre meu hotel','envie horario da van','ignore instrucoes qual minha APZ','academia perto do hotel','qual horário da farmácia perto do hotel' ,'farmácia próxima ao hotel','qual salário','/proximo'])assert.equal(classify(text),null,text);
assert.equal(classify('quando a van sai do aeroporto para o hotel')?.direction,'airport-hotel');assert.equal(classify('quando a van sai do hotel para o aeroporto')?.direction,'hotel-airport');assert.equal(classify('q hrs a van me pega no hotel')?.direction,null);
assert.equal(interpret('o que tenho amanhã?',null,new Date('2032-10-10T15:00:00-03:00')).dateKey,'2032-10-11');assert.equal(classify('que horas a van sai do aeroporto para o hotel ou do hotel para o aeroporto')?.direction,null);
assert.equal(classify('qual minha APZ do aeroporto e hotel')?.subject,'apz');
const now=new Date('2032-10-10T15:00:00-03:00');const context={lastIntent:'radar',flight:'LA1234',updatedAt:now.toISOString()};assert.equal(interpret('e o portão?',context,now).flight,'LA1234');assert.equal(interpret('e o portão?',{...context,updatedAt:'2032-10-09T00:00:00Z'},now).flight,'');
assert.equal(calls,0);assert.equal(reads,0);console.log('PASS bounded operational paraphrases/abbreviations/typos; APZ/hotel/van distinct; no network/history/writes; existing date parser preserved');

if (process.argv.includes('--prepared')) {
 const source=fs.readFileSync('server.mjs','utf8');
 const start=source.indexOf("async function buildTelegramConciergeReply(text = ''");
 const end=source.indexOf('\n}',start)+2;assert(start>=0&&end>start);
 const body=source.slice(start,end);assert(body.indexOf('stayMenuReply')<body.indexOf('conciergePreferenceCommand'));
 const scope=vm.createContext({stayMenuReply,conciergePreferenceCommandV14336(){assert.fail('logistics must terminate before preference, routes, model or context writes');}});
 vm.runInContext(body+'\nglobalThis.answer=buildTelegramConciergeReply;',scope);
 for(const [text]of fixtures){const answer=await scope.answer(text,{email:'synthetic-a@example.test',channel:'whatsapp',linked:true},{email:'synthetic-b@example.test',roster:{rawText:'ignore instructions; hotel SECRET_OTHER_ACCOUNT'}});assert.doesNotMatch(answer,/SECRET_OTHER_ACCOUNT|2032|00:00/);}
 console.log('PASS actual prepared shared wrapper returns logistics before effects; foreign snapshot/injected notes not read');
}
