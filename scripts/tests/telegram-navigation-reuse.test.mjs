import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTelegramMenu, menuTemplate, menuGreeting, hotelsUrl } from '../../server/concierge/telegram-menu.mjs';
import { createTelegramMenuTransport } from '../../server/concierge/telegram-menu-transport.mjs';

const materialized = process.argv.includes('--materialized') || process.env.TELEGRAM_MENU_MATERIALIZED === '1';
const source = fs.readFileSync('server.mjs', 'utf8');
let producerSource = source;
if (!materialized) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-real-producers-'));
  try {
    fs.mkdirSync(path.join(dir, 'server/v1403'), {recursive:true});
    fs.writeFileSync(path.join(dir, 'server.mjs'), source);
    fs.copyFileSync('server/v1403/navigation-callback.snippet', path.join(dir, 'server/v1403/navigation-callback.snippet'));
    execFileSync(process.execPath, [path.resolve('scripts/v1403/apply-navigation.mjs')], {cwd:dir});
    producerSource = fs.readFileSync(path.join(dir, 'server.mjs'), 'utf8');
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
}
const extract = (text, name) => { const match = text.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`)); assert(match, name); return match[0]; };

function fixture() {
  let menu, context, id = 100, time = 1_000_000, linked = true;
  const messages = new Map(), requests = [], answers = [], producers = [], routes = [];
  let editMode = 'ok', clearFails = false, pauseEdit = null, pauseAfterEdit = null, pauseClear = null, pausePrompt = null, profileHook = null;
  const profile = () => { profileHook?.(); return { linked, channel: 'telegram', chatType: 'private', chatId: '101', email: 'synthetic@example.test', accessKeyHash: 'fixture-binding' }; };
  const fetch = async (url, options) => {
    const method = url.split('/').at(-1), body = JSON.parse(options.body); requests.push({ method, body });
    if (method === 'editMessageText' && pauseEdit) await pauseEdit;
    if (method === 'editMessageText' && editMode === 'http') return { ok: false, json: async () => ({ ok: false }) };
    if (method === 'editMessageText' && editMode === 'throw') throw Error('synthetic timeout');
    if (method === 'editMessageReplyMarkup' && pauseClear) await pauseClear;
    if (method === 'editMessageReplyMarkup' && clearFails) throw Error('synthetic clear failure');
    let result;
    if (method === 'sendMessage') {
      result = { message_id: ++id, date: Math.floor(time / 1000), chat: { id: 101, type: 'private' }, text: body.text, reply_markup: body.reply_markup };
      messages.set(id, result);
    } else {
      result = messages.get(body.message_id); assert(result, 'only an existing fixture message may be edited');
      if (method === 'editMessageText') result.text = body.text;
      result.reply_markup = body.reply_markup;
    }
    if (method === 'sendMessage' && body.reply_markup?.inline_keyboard?.flat().some(x=>x.text==='Cancelar') && pausePrompt) await pausePrompt;
    if (method === 'editMessageText' && pauseAfterEdit) await pauseAfterEdit;
    if (method === 'editMessageText' && editMode === 'applied-throw') throw Error('synthetic uncertain delivery');
    return { ok: true, status: 200, json: async () => ({ ok: true, result: structuredClone(result) }) };
  };
  const snapshot = async () => ({ owner: 'synthetic' });
  const reply = async command => { producers.push(command); return command === '/historico_pernoites' ? 'Histórico sintético: registro salvo.' : `Resultado útil ${command}`; };
  const answer = async (id, text) => answers.push(text);
  const apiUrl = method => `https://fixture.invalid/${method}`;
  const producerContext = vm.createContext({ airportIcao: value => value, conciergeKeyboard: menuTemplate() });
  vm.runInContext([extract(producerSource,'conciergeWeatherKeyboard'), extract(producerSource,'conciergeCallConfirmationKeyboard'), extract(producerSource,'requestConciergeCallConfirmation')].join('\n'),producerContext);
  let root, dispatch, input, emit;

  if (materialized) {
    const fn = name => { const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`)); assert(match, name); return match[0]; };
    const runtime = source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/)[0];
    assert(runtime.includes('...createTelegramMenuTransport('));
    context = vm.createContext({ createTelegramMenu: deps => createTelegramMenu(deps, () => time), createTelegramMenuTransport, telegramApiUrl: apiUrl, fetch,
      telegramProfileForChatAsync: async () => profile(), conciergeLoadSnapshot: snapshot, buildTelegramConciergeReply: reply,
      answerTelegramCallback: answer, conciergeWeatherKeyboard: producerContext.conciergeWeatherKeyboard, conciergeSettingsKeyboard: {},
      handleTelegramWeatherCallback:async()=>false, handleTelegramCallCallback:async()=>false,
      handlePlatformVisitorTelegram:async message=>{routes.push(structuredClone(message));return true;} });
    vm.runInContext([fn('sendTelegramMessage'), runtime, fn('processTelegramUpdate')].join('\n'), context);
    root = () => { context.rootMarkup = menuTemplate(); context.rootText = menuGreeting(); return vm.runInContext('sendTelegramMessage(101, rootText, {reply_markup:rootMarkup})', context); };
    dispatch = update => context.processTelegramUpdate(update);
    input = message => vm.runInContext('crewcheckMenu.text', context)(message);
    emit = (text, reply_markup) => { context.emittedText=text; context.emittedMarkup=reply_markup; return vm.runInContext('sendTelegramMessage(101,emittedText,{reply_markup:emittedMarkup})',context); };
  } else {
    const send = async (chatId, text, extra) => {
      extra = await menu.markup(chatId, extra); if (extra === null) return { ok: false };
      const response = await fetch(apiUrl('sendMessage'), { body: JSON.stringify({ chat_id: chatId, text, ...extra }) });
      return { ok: true, data: await response.json() };
    };
    menu = createTelegramMenu({ ...createTelegramMenuTransport({ apiUrl, fetch }), profile: async () => profile(), snapshot, reply, answer, send, weatherKeyboard:producerContext.conciergeWeatherKeyboard }, () => time);
    root = () => send(101, menuGreeting(), { reply_markup: menuTemplate() });
    dispatch = update => menu.callback(update);
    input = message => menu.text(message);
    emit = (text, reply_markup) => send(101,text,{reply_markup});
  }
  const latest = () => [...messages.values()].at(-1);
  const callback = (message, label, from = 101) => ({ callback_query: { id: `fixture-${requests.length}`, from: { id: from }, message: structuredClone(message),
    data: message.reply_markup.inline_keyboard.flat().find(button => button.text === label).callback_data } });
  const press = (message, label, from) => dispatch(callback(message, label, from));
  const makeInput = (text, replyTo) => ({text,chat:{id:101,type:'private'},from:{id:101},message_id:++id,date:Math.floor(time/1000),...(replyTo?{reply_to_message:{message_id:replyTo.message_id}}:{})});
  producerContext.sendTelegramMessage = (chat,text,extra) => emit(text,extra.reply_markup);
  const count = method => requests.filter(x => x.method === method).length;
  return { root, latest, press, callback, dispatch, messages, requests, answers, producers, routes, count, makeInput, input, emit,
    handoff:async message=>{if(materialized)return dispatch({message});if(!await input(message))routes.push(structuredClone(message));}, callPrompt:()=>producerContext.requestConciergeCallConfirmation(101),
    expire: () => { time += 16 * 60_000; }, mode: value => { editMode = value; }, clearFailure: () => { clearFails = true; },
    pausePrompt: promise => { pausePrompt=promise; }, pauseCleanup: promise => { pauseClear=promise; }, pause: promise => { pauseEdit = promise; }, pauseAfter: promise => { pauseAfterEdit = promise; }, revoke: () => { linked = false; }, profileHook: fn => { profileHook = fn; } };
}

test('web-only hotel destination and short accessible controls', () => {
  const buttons = menuTemplate('hoteis').inline_keyboard.flat();
  assert.equal(buttons.find(x => x.text === 'Abrir Hotéis no app').url, hotelsUrl);
  assert.equal(hotelsUrl, 'https://crewcheck.online/?view=hotels');
  assert.deepEqual(buttons.filter(x => x.callback_data).map(x => x.text), ['Histórico', 'Início']);
  assert(!buttons.some(x => /Informar|quarto|APK/i.test(x.text)));
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert(home.includes("if (value === 'hotels' || value === 'hoteis') return 'hotels'"));
  assert(home.includes("view === 'hotels' && <HotelsView"));
});

test('pure navigation edits one message; return and hotel history preserve useful content', async () => {
  const f = fixture(); await f.root(); const original = structuredClone(f.latest());
  await f.press(original, 'Mais'); const nav = f.latest(); const navId = nav.message_id;
  assert.equal(f.messages.get(original.message_id).text, original.text);
  assert.deepEqual(f.messages.get(original.message_id).reply_markup.inline_keyboard, []);
  const sends = f.count('sendMessage');
  await f.press(nav, 'Meteorologia'); assert.equal(f.latest().message_id, navId); assert.equal(f.count('sendMessage'), sends);
  await f.press(f.latest(), 'Voltar'); assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === 'Meteorologia'));
  await f.press(f.latest(), 'Início'); await f.press(f.latest(), 'Hotéis');
  assert.match(f.latest().text, /versão web/);
  await f.press(f.latest(), 'Histórico'); const history = structuredClone(f.latest());
  assert.equal(f.producers.at(-1), '/historico_pernoites');
  await f.press(history, 'Início');
  assert.equal(f.messages.get(history.message_id).text, history.text, 'result content must never be overwritten');
  assert.deepEqual(f.messages.get(history.message_id).reply_markup.inline_keyboard, []);
  assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === 'Hoje'));
});

for (const mode of ['http', 'throw', 'applied-throw']) test(`edit ${mode}: retire uncertain controls and send one fallback`, async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), 'Mais'); const previous = structuredClone(f.latest());
  f.mode(mode); const sends = f.count('sendMessage'); await f.press(previous, 'Meteorologia');
  assert.equal(f.count('sendMessage'), sends + 1);
  assert.deepEqual(f.messages.get(previous.message_id).reply_markup.inline_keyboard, []);
  const after = f.count('sendMessage'); await f.press(previous, 'Meteorologia');
  assert.equal(f.count('sendMessage'), after); assert.match(f.answers.at(-1), /expirou/);
  await f.press(f.latest(), 'Voltar'); assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === 'Meteorologia'));
});

test('failed clear preserves text, but old callbacks cannot duplicate producers', async () => {
  const f = fixture(); await f.root(); const root = structuredClone(f.latest()); f.clearFailure();
  await Promise.all([f.press(root, 'Hoje'), f.press(root, 'Hoje')]);
  assert.deepEqual(f.producers, ['/hoje']); assert.equal(f.messages.get(root.message_id).text, root.text);
  const count = f.count('sendMessage'); await f.press(root, 'Hoje'); assert.equal(f.count('sendMessage'), count);
});

test('concurrent duplicate callbacks do not edit twice', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), 'Mais'); const nav = structuredClone(f.latest());
  let release; const gate = new Promise(resolve => { release = resolve; }); f.pause(gate);
  const first = f.press(nav, 'Meteorologia');
  while (!f.count('editMessageText')) await new Promise(resolve => setTimeout(resolve, 0));
  await f.press(nav, 'Bem-estar'); assert.match(f.answers.at(-1), /expirou/);
  release(); await first; const edited = structuredClone(f.latest());
  await f.press(edited, 'Voltar'); assert.equal(f.count('editMessageText'), 2);
  assert.equal(f.count('sendMessage'), 3, 'only initial removal/root and first navigation were sent');
});

test('revoked/private identity denies callbacks and never edits or dispatches', async () => {
  const f = fixture(); await f.root(); const root = structuredClone(f.latest());
  await f.press(root, 'Hoje', 202); f.revoke(); await f.press(root, 'Hoje');
  assert.equal(f.producers.length, 0); assert.equal(f.count('editMessageReplyMarkup'), 0);
  assert.match(f.answers.at(-1), /não está disponível/);
});

test('expiry/restart are explicit and do not create another menu or execute actions', async () => {
  const f = fixture(); await f.root(); const root = structuredClone(f.latest()); const count = f.count('sendMessage');
  f.expire(); await f.press(root, 'Hoje');
  assert.equal(f.count('sendMessage'), count); assert.equal(f.producers.length, 0); assert.match(f.answers.at(-1), /expirou/);
});


test('new ticket clicked during edit is retained, with clear busy feedback', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), 'Mais'); const nav = structuredClone(f.latest());
  let release; const gate = new Promise(resolve => { release = resolve; }); f.pauseAfter(gate);
  const pending = f.press(nav, 'Meteorologia');
  while (f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === 'Meteorologia')) await new Promise(resolve => setTimeout(resolve, 0));
  const during = structuredClone(f.latest());
  await f.press(during, 'Voltar'); assert.match(f.answers.at(-1), /Aguarde/);
  assert.equal(f.count('editMessageText'), 1);
  release(); await pending; await f.press(during, 'Voltar');
  assert.equal(f.count('editMessageText'), 2);
});

test('uncertain edit plus failed clear leaves only inert old controls', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), 'Mais'); const nav = structuredClone(f.latest());
  f.mode('applied-throw'); f.clearFailure(); await f.press(nav, 'Meteorologia');
  const uncertain = structuredClone(f.messages.get(nav.message_id)); const sends = f.count('sendMessage');
  await f.press(uncertain, 'METAR');
  assert.match(f.answers.at(-1), /expirou/); assert.equal(f.count('sendMessage'), sends); assert.equal(f.producers.length, 0);
});

test('identity revoked during cleanup stops action and fallback', async () => {
  const f = fixture(); await f.root(); const nav = structuredClone(f.latest()); let reads = 0;
  f.profileHook(() => { if (++reads === 3) f.revoke(); });
  const sends = f.count('sendMessage'); await f.press(nav, 'Hoje');
  assert.equal(f.producers.length, 0); assert.equal(f.count('sendMessage'), sends);
});


test('fresh process rejects old tickets with no transport mutation', async () => {
  const first = fixture(); await first.root(); const previous = structuredClone(first.latest());
  const restarted = fixture(); await restarted.dispatch(first.callback(previous, 'Hoje'));
  assert.match(restarted.answers.at(-1), /expirou/); assert.equal(restarted.requests.length, 0);
});

test('edit transport handles missing configuration and malformed provider JSON', async () => {
  const missing = createTelegramMenuTransport({ apiUrl: () => '', fetch: () => assert.fail('must not call transport') });
  assert.deepEqual(await missing.clear(101, 1), {ok:false});
  const malformed = createTelegramMenuTransport({ apiUrl: () => 'https://fixture.invalid', fetch: async () => ({ok:true,json:async()=>{throw Error('invalid JSON');}}) });
  assert.deepEqual(await malformed.edit(101, 1, 'Menu', {reply_markup:menuTemplate()}), {ok:false});
});

async function openQuestion(f, label) {
  await f.root(); await f.press(f.latest(), 'Mais');
  if (label !== 'Radar') await f.press(f.latest(), 'Meteorologia');
  await f.press(f.latest(), label);
  return structuredClone(f.latest());
}

for (const clearFails of [false,true]) test(`answered Radar cancel cannot discard newer METAR (clear fails: ${clearFails})`, async () => {
  const f=fixture(); const radar=await openQuestion(f,'Radar');
  if(clearFails) f.clearFailure();
  assert.equal(await f.input(f.makeInput('LA1234',radar)),true);
  if(!clearFails) assert.deepEqual(f.messages.get(radar.message_id).reply_markup.inline_keyboard,[]);
  const metar=await openQuestion(f,'METAR'); const sends=f.count('sendMessage');
  await f.press(radar,'Cancelar'); assert.match(f.answers.at(-1),/expirou/);
  assert.equal(f.count('sendMessage'),sends,'stale cancel must not send root');
  assert.equal(await f.input(f.makeInput('SBGR',metar)),true);
  assert.deepEqual(f.producers,['/radar LA1234','/metar SBGR']);
});

test('replacement prompt revision rejects old cancel and concurrent old answers',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar'); const invalid=f.makeInput('invalid',old);
  const before=f.count('sendMessage');
  await Promise.all([f.input(invalid),f.input(invalid)]);
  assert.equal(f.count('sendMessage'),before+1,'one replacement prompt only');
  const replacement=structuredClone(f.latest());
  await f.press(old,'Cancelar'); assert.match(f.answers.at(-1),/expirou/);
  await f.input(f.makeInput('Cancelar',old));
  const answer=f.makeInput('LA1234',replacement);
  await Promise.all([f.input(answer),f.input(answer)]);
  assert.deepEqual(f.producers,['/radar LA1234']);
  await f.press(replacement,'Cancelar'); assert.match(f.answers.at(-1),/expirou/);
});

test('expired question is retired before a newer question can be cancelled',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar'); f.expire();
  await f.input(f.makeInput('LA1234',old)); assert.equal(f.producers.length,0);
  assert.deepEqual(f.messages.get(old.message_id).reply_markup.inline_keyboard,[]);
  const current=await openQuestion(f,'METAR'); await f.press(old,'Cancelar');
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/metar SBGR']);
});

test('answer/cancel race claims its question once and cannot cancel the next one',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar'); const answer=f.makeInput('LA1234',old);
  await Promise.all([f.input(answer),f.press(old,'Cancelar'),f.input(answer)]);
  assert(f.producers.length<=1); assert(f.producers.every(x=>x==='/radar LA1234'));
  const current=await openQuestion(f,'METAR'); await f.press(old,'Cancelar');
  await f.input(f.makeInput('SBGR',current)); assert.equal(f.producers.at(-1),'/metar SBGR');
});

test('delayed cleanup of consumed answer never deletes a newer question',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar');
  let release; const gate=new Promise(resolve=>{release=resolve;}); f.pauseCleanup(gate);
  const before=f.count('editMessageReplyMarkup'); const pending=f.input(f.makeInput('LA1234',old));
  while(f.count('editMessageReplyMarkup')===before) await new Promise(resolve=>setTimeout(resolve,0));
  f.pauseCleanup(null); const current=await openQuestion(f,'METAR');
  await f.press(old,'Cancelar'); release(); await pending;
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/radar LA1234','/metar SBGR']);
});

for(const kind of ['METAR','TAF']) test(`real ${kind} keyboard emits a valid new return ticket`,async()=>{
  const f=fixture(); const prompt=await openQuestion(f,kind);
  await f.input(f.makeInput('SBGR',prompt)); const result=structuredClone(f.latest());
  const back=result.reply_markup.inline_keyboard.flat().find(x=>/Voltar ao menu/.test(x.text));
  assert(back?.callback_data?.startsWith('cc_nav:v1:'));
  const weather=result.reply_markup.inline_keyboard.flat().filter(x=>x.callback_data?.startsWith('cc_weather:'));
  assert(weather.some(x=>x.callback_data.includes(':SBGR:raw')));
  const sends=f.count('sendMessage');
  await f.dispatch({callback_query:{id:'old-legacy',data:'cc_nav:menu',from:{id:101},message:result}});
  assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
  await f.press(result,back.text); assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='Hoje'));
  assert.equal(f.messages.get(result.message_id).text,result.text);
});

test('real call confirmation return is ticketed without invoking a call',async()=>{
  const f=fixture(); await f.callPrompt(); const result=structuredClone(f.latest());
  const buttons=result.reply_markup.inline_keyboard.flat();
  assert(buttons.some(x=>x.callback_data==='cc_call:confirm'));
  assert(buttons.some(x=>x.callback_data==='cc_call:cancel'));
  const back=buttons.find(x=>/Voltar ao menu/.test(x.text)); assert(back.callback_data.startsWith('cc_nav:v1:'));
  await f.press(result,back.text); assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='Hoje'));
  assert.equal(f.producers.length,0,'no call producer or finance action');
});


test('cancel during prompt delivery gives busy feedback and remains usable',async()=>{
  const f=fixture(); let release; const gate=new Promise(resolve=>{release=resolve;}); f.pausePrompt(gate);
  const opening=openQuestion(f,'Radar');
  while(!f.latest()?.reply_markup?.inline_keyboard?.flat().some(x=>x.text==='Cancelar')) await new Promise(resolve=>setTimeout(resolve,0));
  const prompt=structuredClone(f.latest()); await f.press(prompt,'Cancelar'); assert.match(f.answers.at(-1),/Aguarde/);
  release(); await opening; await f.press(prompt,'Cancelar');
  assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='Hoje'));
  assert.equal(f.producers.length,0);
});

test('late delivery of superseded replacement cannot revive its cancellation ticket',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar');
  let release; const gate=new Promise(resolve=>{release=resolve;}); f.pausePrompt(gate);
  const pending=f.input(f.makeInput('invalid',old));
  while(f.latest().message_id===old.message_id) await new Promise(resolve=>setTimeout(resolve,0));
  const delayed=structuredClone(f.latest()); f.pausePrompt(null);
  const current=await openQuestion(f,'METAR'); release(); await pending;
  const sends=f.count('sendMessage'); await f.press(delayed,'Cancelar');
  assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
  await f.input(f.makeInput('SBGR',current)); assert.deepEqual(f.producers,['/metar SBGR']);
});


test('reordered plain Cancelar from before current prompt cannot cancel it',async()=>{
  const f=fixture(); const old=await openQuestion(f,'Radar');
  const stale=f.makeInput('Cancelar'); const current=await openQuestion(f,'METAR');
  await f.input(stale); await f.input(f.makeInput('SBGR',current));
  assert.deepEqual(f.producers,['/metar SBGR']);
  assert(stale.message_id<current.message_id);
});


for(const text of ['/emergencia','SOS','Emergência','🚨 Emergência','Ajuda','/ajuda','Menu','/menu','HELP','/emergencia@CrewCheckBot']) {
  for(const replyToOther of [false,true]) test(`priority ${text} reaches downstream router with old reply: ${replyToOther}`,async()=>{
    const f=fixture(); const prompt=await openQuestion(f,'Radar');
    const message=f.makeInput(text,replyToOther?{message_id:1}:null);
    await f.handoff(message);
    assert.equal(f.routes.length,1,'actual prepared process must pass priority input downstream');
    assert.equal(f.routes[0].text,text); assert.equal(f.producers.length,0);
    const sends=f.count('sendMessage'); await f.press(prompt,'Cancelar');
    assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
    assert.equal(await f.input(f.makeInput('LA1234',prompt)),false,'interrupted question cannot resume');
  });
}

for(const other of ['foreign-sender','other-chat','group-chat']) test(`priority from ${other} cannot retire another private question`,async()=>{
  const f=fixture(); const prompt=await openQuestion(f,'Radar');
  const message=f.makeInput('/emergencia',{message_id:1});
  if(other==='foreign-sender')message.from.id=202;
  if(other==='other-chat'){message.chat.id=202;message.from.id=202;}
  if(other==='group-chat')message.chat.type='group';
  const clears=f.count('editMessageReplyMarkup'); await f.handoff(message);
  assert.equal(f.routes.length,1,'menu does not authorize or execute the downstream request');
  assert.equal(f.count('editMessageReplyMarkup'),clears);
  assert.equal(await f.input(f.makeInput('LA1234',prompt)),true);
  assert.deepEqual(f.producers,['/radar LA1234']);
});

for(const text of ['/emergencia','SOS','Ajuda','/menu']) test(`priority ${text} also passes with an expired question`,async()=>{
  const f=fixture(); const prompt=await openQuestion(f,'Radar');f.expire();
  await f.handoff(f.makeInput(text,{message_id:1}));
  assert.equal(f.routes.length,1);assert.equal(await f.input(f.makeInput('LA1234',prompt)),false);
  const current=await openQuestion(f,'METAR');await f.press(prompt,'Cancelar');
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/metar SBGR']);
});

test('ordinary answer attached to old message remains ignored without interrupting current question',async()=>{
  const f=fixture();const prompt=await openQuestion(f,'Radar');
  assert.equal(await f.input(f.makeInput('LA1234',{message_id:1})),true);
  assert.equal(f.producers.length,0);assert.equal(f.routes.length,0);
  assert.equal(await f.input(f.makeInput('LA1234',prompt)),true);
  assert.deepEqual(f.producers,['/radar LA1234']);
});

for(const text of ['/emergencia','SOS','Ajuda','/menu']) test(`priority ${text} passes without a pending prompt`,async()=>{
  const f=fixture();await f.handoff(f.makeInput(text,{message_id:1}));
  assert.equal(f.routes.length,1);assert.equal(f.producers.length,0);
  assert.equal(f.count('sendMessage'),0);
});
