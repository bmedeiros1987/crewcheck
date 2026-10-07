import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { deliverWhatsAppMenuMessage, WHATSAPP_MENU, whatsappMenuEnabled } from '../server/concierge/whatsapp-menu.mjs';

for (const value of [undefined, '', 'false', '0', '1', 'TRUE', ' true ', 'yes', true, 1]) {
  assert.equal(whatsappMenuEnabled({CREWCHECK_WHATSAPP_MENU_ENABLED:value}),false);
}
assert.equal(whatsappMenuEnabled({}),false);
assert.equal(whatsappMenuEnabled({CREWCHECK_WHATSAPP_MENU_ENABLED:'true'}),true);

const A = '5511000000001', B = '5511000000002';
const binding = email => ({ email, consent_concierge: 1, linked_at: '2026-10-03T10:00:00Z' });
let links, calls, sent, handler;
const deps = {
  findLink: async phone => structuredClone(links.get(phone)),
  handler: async input => { calls.push(input); return handler(input); },
  send: async (phone, text, options) => { sent.push({ phone, text, options }); return { ok: true }; },
};
function reset() {
  links = new Map([[A, binding('a@example.invalid')], [B, binding('b@example.invalid')]]);
  calls = []; sent = [];
  handler = async input => ({ reply: `${input.email}: apresentação publicada às 15:40 BRT; escala sintética.` });
}
const message = (text, from = A, type = 'text') => ({ id: 'fake-' + from, from, type, text, phoneNumberId:'synthetic-receiver' });
const run = input => deliverWhatsAppMenuMessage(input, deps);
reset();
await run(message('menu'));
assert.equal(sent[0].text, WHATSAPP_MENU);
assert.equal(calls.length, 0, 'menu must not invoke model/provider/fact engine');
assert.doesNotMatch(sent[0].text, /https?:|abra o app|gratuit/i);
for (const [text, command] of [['Amanhã','/amanha'],['Escala','/escala'],['Diárias','/diarias'],['Hoje','/hoje'],['Próxima programação','/proximo'],['Pernoite','/pernoite'],['Farmácias','/farmacias']]) {
  await run(message(text));
  assert.equal(calls.at(-1).text, command);
  assert.match(sent.at(-1).text, /15:40 BRT/);
  assert.equal(sent.at(-1).phone, A);
}
await run(message('quanto recebo de diária quinta-feira?'));
assert.equal(calls.at(-1).text, 'quanto recebo de diária quinta-feira?', 'financial facts remain in existing engine');
await run(message('1'));
assert.equal(calls.at(-1).text, '1', 'numeric POI confirmations cannot be stolen by menu');
await run(message('hoje', B));
assert.equal(calls.at(-1).email, 'b@example.invalid');
assert.equal(sent.at(-1).phone, B);
assert.doesNotMatch(sent.at(-1).text, /a@example/);
assert.deepEqual(sent.at(-1).options, { replyToMessageId: 'fake-' + B });

reset();
let finishA;
handler = input => input.email === 'a@example.invalid'
  ? new Promise(resolve => { finishA=resolve; })
  : Promise.resolve('Resposta privada B');
const slowA = run(message('hoje', A));
await new Promise(resolve => setImmediate(resolve));
await run(message('hoje', B));
finishA('Resposta privada A');
await slowA;
assert.deepEqual(sent.map(({phone,text})=>({phone,text})), [
  {phone:B,text:'Resposta privada B'}, {phone:A,text:'Resposta privada A'},
], 'concurrent accounts must keep recipients and answers separate');

reset();
links.delete(A);
await run(message('hoje'));
assert.equal(calls.length, 0);
assert.match(sent[0].text, /vincule/);
for (const override of [{consent_concierge:0}, {revoked_at:'2026-10-03'}, {linked_at:null}]) {
  reset(); links.set(A, {...binding('a@example.invalid'), ...override});
  await run(message('hoje'));
  assert.equal(calls.length, 0); assert.equal(sent.length, 0);
}
for (const type of ['interactive','button']) {
  reset();
  await run({...message('/emergencia', A, type), callback:'cc_menu:unknown', interactive:{button_reply:{id:'arbitrary',title:'Hoje'}}});
  assert.equal(calls.length, 0, 'unvalidated callbacks/title must never dispatch commands');
  assert.match(sent[0].text, /botão não está disponível/);
}
reset();
await run(message('', A, 'document'));
assert.equal(calls.length, 0);
assert.match(sent[0].text, /PDF.*ainda não está disponível/);
reset();
const location = {latitude:-23.4,longitude:-46.4};
await run({...message('', A, 'location'), location});
assert.deepEqual(calls[0].location, location);
assert.equal(calls[0].messageType, 'location');

for (const change of ['revoked','other_account','new_binding','consent']) {
  reset();
  let finish;
  handler = () => new Promise(resolve => { finish=resolve; });
  const pending = run(message('hoje'));
  await new Promise(resolve => setImmediate(resolve));
  if (change === 'revoked') links.delete(A);
  if (change === 'other_account') links.set(A, binding('b@example.invalid'));
  if (change === 'new_binding') links.set(A, {...binding('a@example.invalid'),linked_at:'2026-10-03T11:00:00Z'});
  if (change === 'consent') links.get(A).consent_concierge=0;
  finish('Private answer A');
  const result=await pending;
  assert.equal(result.reason,'link_changed'); assert.equal(sent.length,0);
}
reset(); handler=async()=>{throw Error('private provider detail');};
await run(message('hoje')); assert.doesNotMatch(sent[0].text,/private provider|abra|app/i);
reset();
const failure = await deliverWhatsAppMenuMessage(message('menu'), {...deps, send:async()=>({ok:false})});
assert.equal(failure.sent,false); assert.equal(failure.reason,'delivery_failed');

// Execute the actual prepared inbound function. Existing link-code flow stays
// upstream; the adapter receives the current handler and sends through WhatsApp.
const source = fs.readFileSync('server/whatsapp.mjs','utf8');
const inbound = source.slice(source.indexOf('async function handleInboundMessage(message)'),source.indexOf('async function processWhatsAppPayload'));
assert.match(inbound,/await deliverWhatsAppMenuMessage/);
assert.match(inbound,/tryCompleteLink/);
let environment={CREWCHECK_WHATSAPP_MENU_ENABLED:'true'};
const context=vm.createContext({
  whatsappMenuEnabled:()=>whatsappMenuEnabled(environment),
  console:{error:()=>{}},
  phoneNumberId:()=> 'synthetic-receiver',
  normalizePhone:value=>String(value).replace(/\D/g,''),
  tryCompleteLink:async()=>{throw Error('linking was not requested');},
  deliverWhatsAppMenuMessage,findActiveLinkByPhone:deps.findLink,
  whatsappConciergeHandler:deps.handler,sendWhatsAppText:deps.send,
});
vm.runInContext(inbound,context);
reset();await context.handleInboundMessage(message('menu'));
assert.equal(sent[0].text,WHATSAPP_MENU);assert.equal(calls.length,0);
await context.handleInboundMessage(message('hoje',B));
assert.equal(calls[0].email,'b@example.invalid');assert.equal(sent.at(-1).phone,B);
for (const phoneNumberId of ['', undefined, 'other-business-receiver']) {
  reset();
  await context.handleInboundMessage({...message('123456'),phoneNumberId});
  await context.handleInboundMessage({...message('hoje'),phoneNumberId});
  assert.equal(sent.length,0); assert.equal(calls.length,0);
}
reset();
context.phoneNumberId=()=>'';
await context.handleInboundMessage(message('123456'));
assert.equal(sent.length,0); assert.equal(calls.length,0);
context.phoneNumberId=()=> 'synthetic-receiver';
assert.ok(inbound.indexOf('message?.phoneNumberId !== expectedPhoneNumberId') < inbound.indexOf('tryCompleteLink'), 'receiver check must precede even account linking');
// OFF/invalid values execute the PR890 protected path: one engine call and one
// response, with the existing authorization recheck and receiver validation.
const enabledDelivery=context.deliverWhatsAppMenuMessage;
context.deliverWhatsAppMenuMessage=()=>{throw Error('OFF must not invoke new adapter');};
context.phoneNumberId=()=> 'synthetic-receiver';
for (const value of [undefined, '', 'false', 'TRUE', '1', 'invalid']) {
  environment={CREWCHECK_WHATSAPP_MENU_ENABLED:value};
  reset();let linkReads=0;
  context.findActiveLinkByPhone=async phone=>{linkReads++;return deps.findLink(phone);};
  await context.handleInboundMessage(message('menu'));
  assert.equal(linkReads,2);assert.equal(calls.length,1);assert.equal(calls[0].text,'menu');
  assert.equal(sent.length,1);assert.notEqual(sent[0].text,WHATSAPP_MENU);
  assert.match(sent[0].text,/15:40 BRT/);
}
reset();links.delete(A);
await context.handleInboundMessage(message('menu'));
assert.equal(calls.length,0);assert.equal(sent.length,1);assert.match(sent[0].text,/conecte este WhatsApp/);
reset();
await context.handleInboundMessage(message('arbitrary',A,'interactive'));
assert.equal(calls.length,0);assert.equal(sent.length,1);assert.match(sent[0].text,/aceita texto e localização/);
reset();
context.tryCompleteLink=async()=>({linked:true});
await context.handleInboundMessage(message('123456'));
assert.equal(calls.length,0);assert.equal(sent.length,1);assert.match(sent[0].text,/WhatsApp conectado/);
environment={CREWCHECK_WHATSAPP_MENU_ENABLED:'true'};
context.phoneNumberId=()=> 'synthetic-receiver';
context.deliverWhatsAppMenuMessage=enabledDelivery;
reset();await context.handleInboundMessage(message('menu'));
assert.equal(calls.length,0);assert.equal(sent.length,1);assert.equal(sent[0].text,WHATSAPP_MENU);
assert.equal(sent[0].options.expectedPhoneNumberId,'synthetic-receiver','delegated menu must capture the validated sender');
// Execute the real transport together with the prepared handler and menu.
let network=[];let configured='synthetic-receiver';let linkingCalls=0;
Object.assign(context,{
  phoneNumberId:()=>configured,accessToken:()=> 'synthetic-token',graphVersion:()=> 'v26.0',
  AbortController,setTimeout,clearTimeout,console:{info:()=>{},warn:()=>{},error:()=>{}},
  tryCompleteLink:async()=>{linkingCalls++;return {linked:true};},
  fetch:async(url,options)=>{network.push({url,options});return {ok:true,json:async()=>({messages:[{id:'synthetic-out'}]})};},
});
const transport=source.slice(source.indexOf('export async function sendWhatsAppText('),source.indexOf('async function findActiveLinkByPhone('));
vm.runInContext(transport.replace('export ',''),context);
for (const flag of [undefined,'true']) {
  environment={CREWCHECK_WHATSAPP_MENU_ENABLED:flag};
  reset();network=[];configured='synthetic-receiver';linkingCalls=0;
  for(const phoneNumberId of ['',undefined,'other-receiver']) {
    await context.handleInboundMessage({...message('123456'),phoneNumberId});
    await context.handleInboundMessage({...message('menu'),phoneNumberId});
  }
  assert.equal(network.length+calls.length+linkingCalls,0,'OFF and ON reject unauthorized receivers before linking');
  await context.handleInboundMessage(message('menu'));
  assert.equal(network.length,1);assert.match(network[0].url,/\/synthetic-receiver\/messages$/);
  if(flag==='true') assert.equal(JSON.parse(network[0].options.body).text.body,WHATSAPP_MENU);
  reset();network=[];
  handler=async()=>{configured='changed-during-await';return 'private answer';};
  await context.handleInboundMessage(message('hoje'));
  assert.equal(network.length,0,'OFF and ON prevent sender drift after engine await');
  for(const mutation of [()=>links.delete(A),()=>links.set(A,binding('other@example.invalid')),()=>links.set(A,{...binding('a@example.invalid'),consent_concierge:0})]) {
    reset();network=[];configured='synthetic-receiver';handler=async()=>{mutation();return 'stale answer';};
    await context.handleInboundMessage(message('hoje'));assert.equal(network.length,0,'combined binding guard suppresses stale answers');
  }
  reset();network=[];configured='synthetic-receiver';
  await context.handleInboundMessage(message('arbitrary',A,'interactive'));
  assert.equal(calls.length,0);assert.equal(network.length,1,'callback cannot dispatch facts in either mode');
}
assert.doesNotMatch(fs.readFileSync('server/concierge/whatsapp-menu.mjs','utf8'),/console\.(?:log|info|warn|error)/);
assert.match(source,/WHERE phone_hash=\? AND revoked_at IS NULL/);
assert.match(source,/acceptedMessageIds.delete\(message.id\)/);
console.log('PASS default-OFF original behavior, invalid flag values, simulated ON; deterministic WhatsApp menu, same-channel factual replies, A/B isolation, revocation/relink, invalid callback, location and prepared adapter; zero real APIs');
