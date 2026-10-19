import assert from 'node:assert/strict';
import { createTelegramMenu } from '../server/concierge/telegram-menu.mjs';
import fs from 'node:fs';import vm from 'node:vm';
import { wellhubUnitActions, wellhubUnitPageUrl, wellhubTelegramMessage, wellhubPlainMessage } from '../shared/wellhub-unit-actions.mjs';
import { loadVerifiedWellhubPartners } from '../server/v14407/wellhub.mjs';
import { handleWellhubUnitRoute } from '../server/wellhub/unit-actions.mjs';
const now=new Date('2026-10-10T22:00:00Z');
const partner={id:'synthetic-unit',name:'Unidade 🏋️ <Teste> & "A"',city:'Cidade Sintética',state:'CE',address:'Rua Exemplo 123',sourceUrl:'https://wellhub.com/pt-br/search/partners/synthetic-unit/',verifiedAt:'2026-10-10'};
const destination={kind:'public-unit',unitId:partner.id,city:partner.city,state:partner.state,sourceUrl:partner.sourceUrl,verifiedAt:'2026-10-10',latitude:-3,longitude:-38};
const actions=wellhubUnitActions(partner,{clientId:'syntheticClient',destination,now});
assert.equal(actions.autoDestination,true);const uber=new URL(actions.uberUrl);assert.equal(uber.origin,'https://m.uber.com');assert.equal(uber.pathname,'/looking');
assert.deepEqual(JSON.parse(uber.searchParams.get('drop[0]')),{latitude:-3,longitude:-38,addressLine1:partner.name,addressLine2:partner.address});
assert.deepEqual([...uber.searchParams.keys()].sort(),['client_id','drop[0]']);assert.equal(new URL(actions.uberWebUrl).pathname,'/');
const map=new URL(actions.mapUrl);assert.equal(map.searchParams.get('api'),'1');assert.ok(map.searchParams.get('query').includes(partner.address));assert.equal(map.searchParams.has('origin'),false);
for(const bad of [{unitId:'other'},{city:'Outra cidade'},{state:'DF'},{verifiedAt:'2026-01-01'},{verifiedAt:'2026-10-11'},{verifiedAt:'2026-02-30'},{latitude:'-3'},{longitude:Infinity},{latitude:40},{sourceUrl:'https://evil.invalid'},{kind:'private-location'}]){
 assert.equal(wellhubUnitActions(partner,{clientId:'syntheticClient',destination:{...destination,...bad},now}).autoDestination,false,JSON.stringify(bad));
}
for(const clientId of ['',null,'x&pickup=private'])assert.equal(wellhubUnitActions(partner,{clientId,destination,now}).autoDestination,false);
assert.equal(wellhubUnitActions({...partner,verifiedAt:'2026-01-01'},{clientId:'syntheticClient',destination,now}).autoDestination,false);
assert.equal(wellhubUnitPageUrl('../private?email=x'),'');
for(const sourceUrl of ['javascript:alert(1)','https://user@wellhub.com/pt-br/search/partners/x/','https://wellhub.com.evil.invalid/pt-br/search/partners/x/'])assert.equal(wellhubUnitActions({...partner,sourceUrl},{now}).ficheUrl,'');
const text=`Academias · Cidade Sintética/CE · Silver+\n\n1. ${partner.name}\nCondição: Agendamento obrigatório.\nFonte oficial: ${partner.sourceUrl}\n\nCatálogo parcial; confirme acesso e condições.`;
const rich=wellhubTelegramMessage(text,[partner]);assert.equal(rich.entities.length,1);assert.equal(rich.text.slice(rich.entities[0].offset,rich.entities[0].offset+rich.entities[0].length),'Ficha e ações');assert.equal(rich.entities[0].url,'https://crewcheck.onrender.com/academias/unidade/synthetic-unit');
assert.ok(rich.text.includes(partner.name));assert.ok(rich.text.includes('Agendamento obrigatório.'));assert.ok(rich.text.endsWith('Catálogo parcial; confirme acesso e condições.'));
assert.equal(wellhubTelegramMessage(text,[]).text,text);assert.equal(wellhubTelegramMessage(text.replace('Academias ·','Hotéis ·'),[partner]).text,text.replace('Academias ·','Hotéis ·'));
assert.equal(wellhubTelegramMessage(text+'x'.repeat(4000),[partner]).entities.length,0);
assert.ok(wellhubPlainMessage(text,[partner]).includes('Ficha e ações: https://crewcheck.onrender.com/academias/unidade/synthetic-unit'));
const source=fs.readFileSync(process.env.WELLHUB_TRANSPORT_SOURCE || 'server.mjs','utf8');
const extract=(s,name)=>{const at=s.indexOf(`async function ${name}(`);assert.ok(at>=0);return s.slice(at,s.indexOf('\n}',at)+2);};
let payload,calls=0;
const context=vm.createContext({crewcheckMenu:createTelegramMenu({}),wellhubTelegramMessage,loadVerifiedWellhubPartners:()=>[partner],telegramApiUrl:()=> 'https://example.invalid/sendMessage',fetch:async(_,init)=>{calls++;payload=JSON.parse(init.body);return{ok:true,status:200,json:async()=>({ok:true})}}});
vm.runInContext(extract(source,'sendTelegramMessage')+'\nthis.send=sendTelegramMessage;',context);
const keyboard={keyboard:[[{text:'Menu'}]]};await context.send('synthetic-chat',text,{reply_markup:keyboard});
assert.ok(payload.entities?.length===1,'actual Telegram transport must emit native text_link aliases');assert.equal(payload.parse_mode,undefined);assert.deepEqual(payload.reply_markup,keyboard);assert.equal(payload.allow_paid_broadcast,undefined);assert.equal(calls,1);
assert.equal(payload.text.slice(payload.entities[0].offset,payload.entities[0].offset+payload.entities[0].length),'Ficha e ações');
const whatsapp=fs.readFileSync('server/whatsapp.mjs','utf8');let waPayload;
const waContext=vm.createContext({wellhubPlainMessage,loadVerifiedWellhubPartners:()=>[partner],accessToken:()=> 'synthetic',phoneNumberId:()=> 'synthetic',normalizePhone:()=> 'synthetic',graphVersion:()=> 'synthetic',AbortController,setTimeout:()=>1,clearTimeout:()=>{},console,fetch:async(_,init)=>{waPayload=JSON.parse(init.body);return{ok:true,status:200,json:async()=>({messages:[]})}}});
vm.runInContext(extract(whatsapp,'sendWhatsAppText').replace('export ','')+'\nthis.send=sendWhatsAppText;',waContext);await waContext.send('synthetic',text,{replyToMessageId:'synthetic-message',expectedPhoneNumberId:'synthetic'});
assert.equal(waPayload.type,'text');assert.equal(waPayload.template,undefined);assert.ok(waPayload.text.body.includes('/academias/unidade/synthetic-unit'));assert.equal(waPayload.context.message_id,'synthetic-message');
const catalog=loadVerifiedWellhubPartners();for(const p of catalog)assert.equal(wellhubUnitActions(p,{clientId:'syntheticClient',now}).autoDestination,false,'no invented public coordinates in current catalog');
for(const [method,id,status] of [['GET','greenlife-messejana-ce',200],['GET','unknown',404],['POST','greenlife-messejana-ce',405],['GET','../private',404]]){
 let code,body;await handleWellhubUnitRoute({method,body:{privateLocation:'never forward'}},{writeHead:s=>code=s,end:s=>body=JSON.parse(s)},new URL('https://example.invalid/api/wellhub/unit/'+id));assert.equal(code,status);assert.equal(JSON.stringify(body).includes('privateLocation'),false);if(status===200){assert.equal(body.actions.autoDestination,false);assert.equal(body.actions.uberUrl,'https://m.uber.com/');}
}
console.log('PASS: actual materialized Telegram/WhatsApp payloads, UTF-16 aliases, public fiche/maps, guarded Uber destination, fresh/unit/source checks, no private pickup/template/broadcast/real network');
