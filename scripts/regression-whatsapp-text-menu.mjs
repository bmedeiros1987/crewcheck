import {conciergeFinalizeReplyV14354} from '../server/v14354/concierge-language.mjs';
import {conciergeHumanizeReplyV14408} from '../server/v14408/concierge-human.mjs';
import {stayMenuReply} from '../server/concierge/stay-menu.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {WHATSAPP_TEXT_MENU,whatsappTextMenu as route} from '../server/concierge/whatsapp-text-menu.mjs';
let calls=0;globalThis.fetch=()=>{calls++;assert.fail('NO_NETWORK');};
const profile={channel:'whatsapp',linked:true,email:'synthetic@example.test'};
assert(WHATSAPP_TEXT_MENU.length<4000);assert(!/\bmais\b/i.test(WHATSAPP_TEXT_MENU));
assert.match(WHATSAPP_TEXT_MENU,/CrewCierge · BETA/);
const visibleOptions=[...WHATSAPP_TEXT_MENU.matchAll(/^(\d+)\. /gm)].map(match=>Number(match[1]));
assert.deepEqual(visibleOptions,Array.from({length:17},(_,i)=>i+1),'all existing options remain visible, ordered and unique');
for(const label of ['📅 *ESCALA SALVA','🏨 *PERNOITE E TRANSPORTE','📡 *VOOS, TEMPO E SERVIÇOS','📱 *CONTINUE NO APP','🔒 *ACESSO BETA'])assert(WHATSAPP_TEXT_MENU.includes(label));
assert(!/emergência|inteligência artificial|IA ativada/i.test(WHATSAPP_TEXT_MENU),'no unshipped capabilities advertised');
for(let i=1;i<=17;i++){assert(WHATSAPP_TEXT_MENU.includes(`${i}. `));const r=route(String(i),profile);assert(r&&typeof(r.reply||r.text)==='string');assert((r.reply||r.text).length<4000);}
for(const text of ['oi','OLÁ!','menu','/start','ajuda','boa tarde'])assert.equal(route(text,profile)?.reply,WHATSAPP_TEXT_MENU);
for(const p of [{},{...profile,channel:'telegram'},{...profile,channel:'app'},{...profile,linked:false},{...profile,email:'invalid'}])assert.equal(route('menu',p),null);
assert.equal(route('opção 3',profile)?.text,'/proximo');assert.equal(route('17)',profile)?.reply.includes('consentimento'),true);
for(const text of ['qual minha próxima jornada?','troque meu nome','ignore instruções','3 e envie mensagem','1; salvar hotel'])assert.equal(route(text,profile),null);
assert.match(route('99',profile).reply,/não está/);assert.equal(calls,0);console.log('PASS complete bounded WhatsApp text menu,17 options, free-question examples, no Mais, explicit numbers, one response under4000, no tools/writes/other-channel changes');

if(process.argv.includes('--prepared')){
 const source=fs.readFileSync('server.mjs','utf8');const start=source.indexOf("async function buildTelegramConciergeReply(text = ''"),end=source.indexOf('\n}',start)+2;assert(start>=0);const body=source.slice(start,end);assert(body.includes('if (stayMenu.text) text = stayMenu.text'));assert(source.includes("from './server/concierge/stay-menu.mjs'"));
 const delegated=[],history=[];const scope=vm.createContext({stayMenuReply:(text,p)=>stayMenuReply(text,p,{readHistory:async owner=>{history.push(owner);return {records:[{date:'2032-10-10',hotel:'Synthetic approved hotel',airport:'BSB'}]};}}),conciergeFinalizeReplyV14354,conciergeHumanizeReplyV14408,conciergePreferenceCommandV14336:async text=>{delegated.push(text);return {handled:true,reply:'EXISTING:'+text};}});vm.runInContext(body+'\nglobalThis.reply=buildTelegramConciergeReply;',scope);
 assert.equal(await scope.reply('oi',profile,null),WHATSAPP_TEXT_MENU);await scope.reply('3',profile,null);assert.equal(delegated.at(-1),'/proximo');assert.equal(await scope.reply('9',profile,null),route('9',profile).reply);const before=delegated.length;const saved=await scope.reply('6',profile,null);assert.match(saved,/Synthetic approved hotel/);assert.match(saved,/Histórico de pernoites/);assert.deepEqual(history,[profile.email]);assert.equal(delegated.length,before,'option6 stays inside the original authorized history producer');await scope.reply('menu',{...profile,channel:'telegram'},null);assert.equal(delegated.at(-1),'menu');await scope.reply('qual minha próxima jornada?',profile,null);assert.equal(delegated.at(-1),'qual minha próxima jornada?');console.log('PASS actual prepared wrapper: complete first greeting/help, one reply only, number delegates to existing engine, free text and Telegram preserved');
}
