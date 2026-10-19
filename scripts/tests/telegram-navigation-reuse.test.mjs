import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTelegramMenu, menuTemplate, menuGreeting, hotelsUrl } from '../../server/concierge/telegram-menu.mjs';
import { stayMenuReply } from '../../server/concierge/stay-menu.mjs';
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

function fixture({publicProfile='linked'}={}) {
  let menu, context, id = 100, time = 1_000_000, linked = true, account = 'synthetic@example.test', snapshotHook = null, replyHook = null;
  const messages = new Map(), requests = [], answers = [], producers = [], routes = [];
  let editMode = 'ok', clearFails = false, pauseEdit = null, pauseAfterEdit = null, pauseClear = null, pausePrompt = null, profileHook = null;
  const profile = () => { profileHook?.(); if(publicProfile==='lookup-failure')throw Error('Synthetic lookup failure'); if(publicProfile==='missing')return null; return { linked:publicProfile==='revoked'?false:linked, channel: 'telegram', chatType: 'private', chatId: '101', email: account, accessKeyHash: 'fixture-binding' }; };
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
    if (method === 'sendMessage' && body.reply_markup?.inline_keyboard?.flat().some(x=>x.text==='✖️ Cancelar') && pausePrompt) await pausePrompt;
    if (method === 'editMessageText' && pauseAfterEdit) await pauseAfterEdit;
    if (method === 'editMessageText' && editMode === 'applied-throw') throw Error('synthetic uncertain delivery');
    return { ok: true, status: 200, json: async () => ({ ok: true, result: structuredClone(result) }) };
  };
  const snapshotReads = [];
  const snapshot = async profile => { snapshotReads.push(profile.email); await snapshotHook?.(); return { owner: profile.email }; };
  const reply = async command => { producers.push(command); await replyHook?.(); return command === '/historico_pernoites' ? 'Histórico sintético: registro salvo.' : `Resultado útil ${command}`; };
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
  return { root, latest, press, callback, dispatch, messages, requests, answers, producers, routes, count, makeInput, input, emit, snapshotReads,
    onSnapshot: fn => { snapshotHook = fn; }, onReply: fn => { replyHook = fn; }, relink: () => { account = 'other@example.test'; },
    handoff:async message=>{if(materialized)return dispatch({message});if(!await input(message))routes.push(structuredClone(message));}, callPrompt:()=>producerContext.requestConciergeCallConfirmation(101), weather:(station,kind)=>producerContext.conciergeWeatherKeyboard(station,kind),
    expire: () => { time += 16 * 60_000; }, mode: value => { editMode = value; }, clearFailure: () => { clearFails = true; },
    pausePrompt: promise => { pausePrompt=promise; }, pauseCleanup: promise => { pauseClear=promise; }, pause: promise => { pauseEdit = promise; }, pauseAfter: promise => { pauseAfterEdit = promise; }, revoke: () => { linked = false; }, profileHook: fn => { profileHook = fn; } };
}

test('web-only hotel destination and short accessible controls', () => {
  const buttons = menuTemplate('hoteis').inline_keyboard.flat();
  assert.equal(buttons.find(x => x.text === '🏨 Abrir Hotéis no app').url, hotelsUrl);
  assert.equal(hotelsUrl, 'https://crewcheck.online/?view=hotels');
  assert.deepEqual(buttons.filter(x => x.callback_data).map(x => x.text), ['🕘 Histórico', '📝 Hotel no app', '🛏️ Quarto no app', '↩️ Voltar', '🏠 Início']);
  assert(!buttons.some(x => /APK/i.test(x.text)));
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  assert(home.includes("if (value === 'hotels' || value === 'hoteis') return 'hotels'"));
  assert(home.includes("view === 'hotels' && <HotelsView"));
});

test('pure navigation edits one message; return and hotel history preserve useful content', async () => {
  const f = fixture(); await f.root(); const original = structuredClone(f.latest());
  await f.press(original, '➕ Mais'); const nav = f.latest(); const navId = nav.message_id;
  assert.equal(f.messages.get(original.message_id).text, original.text);
  assert.deepEqual(f.messages.get(original.message_id).reply_markup.inline_keyboard, []);
  const sends = f.count('sendMessage');
  await f.press(nav, '🌤️ Meteorologia'); assert.equal(f.latest().message_id, navId); assert.equal(f.count('sendMessage'), sends);
  await f.press(f.latest(), '↩️ Voltar'); assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === '🌤️ Meteorologia'));
  await f.press(f.latest(), '🏠 Início'); await f.press(f.latest(), '🏨 Pernoite');
  assert.match(f.latest().text, /versão web/);
  await f.press(f.latest(), '🕘 Histórico'); const history = structuredClone(f.latest());
  assert.equal(f.producers.at(-1), '/historico_pernoites');
  await f.press(history, '🏠 Início');
  assert.equal(f.messages.get(history.message_id).text, history.text, 'result content must never be overwritten');
  assert.deepEqual(f.messages.get(history.message_id).reply_markup.inline_keyboard, []);
  assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === '📅 Programação'));
});

for (const mode of ['http', 'throw', 'applied-throw']) test(`edit ${mode}: retire uncertain controls and send one fallback`, async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), '➕ Mais'); const previous = structuredClone(f.latest());
  f.mode(mode); const sends = f.count('sendMessage'); await f.press(previous, '🌤️ Meteorologia');
  assert.equal(f.count('sendMessage'), sends + 1);
  assert.deepEqual(f.messages.get(previous.message_id).reply_markup.inline_keyboard, []);
  const after = f.count('sendMessage'); await f.press(previous, '🌤️ Meteorologia');
  assert.equal(f.count('sendMessage'), after); assert.match(f.answers.at(-1), /expirou/);
  await f.press(f.latest(), '↩️ Voltar'); assert(f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === '🌤️ Meteorologia'));
});

test('failed clear preserves text, but old callbacks cannot duplicate producers', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), '📅 Programação'); const root = structuredClone(f.latest()); f.clearFailure();
  await Promise.all([f.press(root, '📅 Hoje'), f.press(root, '📅 Hoje')]);
  assert.deepEqual(f.producers, ['/hoje']); assert.equal(f.messages.get(root.message_id).text, root.text);
  const count = f.count('sendMessage'); await f.press(root, '📅 Hoje'); assert.equal(f.count('sendMessage'), count);
});

test('concurrent duplicate callbacks do not edit twice', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), '➕ Mais'); const nav = structuredClone(f.latest());
  let release; const gate = new Promise(resolve => { release = resolve; }); f.pause(gate);
  const first = f.press(nav, '🌤️ Meteorologia');
  while (!f.count('editMessageText')) await new Promise(resolve => setTimeout(resolve, 0));
  await f.press(nav, '🌿 Bem-estar'); assert.match(f.answers.at(-1), /expirou/);
  release(); await first; const edited = structuredClone(f.latest());
  await f.press(edited, '↩️ Voltar'); assert.equal(f.count('editMessageText'), 2);
  assert.equal(f.count('sendMessage'), 3, 'only initial removal/root and first navigation were sent');
});

test('revoked/private identity denies callbacks and never edits or dispatches', async () => {
  const f = fixture(); await f.root(); const root = structuredClone(f.latest());
  await f.press(root, '📅 Programação', 202); f.revoke(); await f.press(root, '📅 Programação');
  assert.equal(f.producers.length, 0); assert.equal(f.count('editMessageReplyMarkup'), 0);
  assert.match(f.answers.at(-1), /não está disponível/);
});

test('expiry/restart are explicit and do not create another menu or execute actions', async () => {
  const f = fixture(); await f.root(); const root = structuredClone(f.latest()); const count = f.count('sendMessage');
  f.expire(); await f.press(root, '📅 Programação');
  assert.equal(f.count('sendMessage'), count); assert.equal(f.producers.length, 0); assert.match(f.answers.at(-1), /expirou/);
});


test('new ticket clicked during edit is retained, with clear busy feedback', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), '➕ Mais'); const nav = structuredClone(f.latest());
  let release; const gate = new Promise(resolve => { release = resolve; }); f.pauseAfter(gate);
  const pending = f.press(nav, '🌤️ Meteorologia');
  while (f.latest().reply_markup.inline_keyboard.flat().some(x => x.text === '🌤️ Meteorologia')) await new Promise(resolve => setTimeout(resolve, 0));
  const during = structuredClone(f.latest());
  await f.press(during, '↩️ Voltar'); assert.match(f.answers.at(-1), /Aguarde/);
  assert.equal(f.count('editMessageText'), 1);
  release(); await pending; await f.press(during, '↩️ Voltar');
  assert.equal(f.count('editMessageText'), 2);
});

test('uncertain edit plus failed clear leaves only inert old controls', async () => {
  const f = fixture(); await f.root(); await f.press(f.latest(), '➕ Mais'); const nav = structuredClone(f.latest());
  f.mode('applied-throw'); f.clearFailure(); await f.press(nav, '🌤️ Meteorologia');
  const uncertain = structuredClone(f.messages.get(nav.message_id)); const sends = f.count('sendMessage');
  await f.press(uncertain, '🌤️ METAR');
  assert.match(f.answers.at(-1), /expirou/); assert.equal(f.count('sendMessage'), sends); assert.equal(f.producers.length, 0);
});

test('identity revoked during cleanup stops action and fallback', async () => {
  const f = fixture(); await f.root(); const nav = structuredClone(f.latest()); let reads = 0;
  f.profileHook(() => { if (++reads === 3) f.revoke(); });
  const sends = f.count('sendMessage'); await f.press(nav, '📅 Programação');
  assert.equal(f.producers.length, 0); assert.equal(f.count('sendMessage'), sends);
});


test('fresh process rejects old tickets with no transport mutation', async () => {
  const first = fixture(); await first.root(); const previous = structuredClone(first.latest());
  const restarted = fixture(); await restarted.dispatch(first.callback(previous, '📅 Programação'));
  assert.match(restarted.answers.at(-1), /expirou/); assert.equal(restarted.requests.length, 0);
});

test('edit transport handles missing configuration and malformed provider JSON', async () => {
  const missing = createTelegramMenuTransport({ apiUrl: () => '', fetch: () => assert.fail('must not call transport') });
  assert.deepEqual(await missing.clear(101, 1), {ok:false});
  const malformed = createTelegramMenuTransport({ apiUrl: () => 'https://fixture.invalid', fetch: async () => ({ok:true,json:async()=>{throw Error('invalid JSON');}}) });
  assert.deepEqual(await malformed.edit(101, 1, 'Menu', {reply_markup:menuTemplate()}), {ok:false});
});

async function openQuestion(f, label) {
  await f.root(); await f.press(f.latest(), ['📡 Radar', '🚪 Portão'].includes(label) ? '📅 Programação' : '➕ Mais');
  if (!['📡 Radar', '🚪 Portão'].includes(label)) await f.press(f.latest(), '🌤️ Meteorologia');
  await f.press(f.latest(), label);
  return structuredClone(f.latest());
}

for (const clearFails of [false,true]) test(`answered Radar cancel cannot discard newer METAR (clear fails: ${clearFails})`, async () => {
  const f=fixture(); const radar=await openQuestion(f,'📡 Radar');
  if(clearFails) f.clearFailure();
  assert.equal(await f.input(f.makeInput('LA1234',radar)),true);
  if(!clearFails) assert.deepEqual(f.messages.get(radar.message_id).reply_markup.inline_keyboard,[]);
  const metar=await openQuestion(f,'🌤️ METAR'); const sends=f.count('sendMessage');
  await f.press(radar,'✖️ Cancelar'); assert.match(f.answers.at(-1),/expirou/);
  assert.equal(f.count('sendMessage'),sends,'stale cancel must not send root');
  assert.equal(await f.input(f.makeInput('SBGR',metar)),true);
  assert.deepEqual(f.producers,['/radar LA1234','/metar SBGR']);
});

test('replacement prompt revision rejects old cancel and concurrent old answers',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar'); const invalid=f.makeInput('invalid',old);
  const before=f.count('sendMessage');
  await Promise.all([f.input(invalid),f.input(invalid)]);
  assert.equal(f.count('sendMessage'),before+1,'one replacement prompt only');
  const replacement=structuredClone(f.latest());
  await f.press(old,'✖️ Cancelar'); assert.match(f.answers.at(-1),/expirou/);
  await f.input(f.makeInput('✖️ Cancelar',old));
  const answer=f.makeInput('LA1234',replacement);
  await Promise.all([f.input(answer),f.input(answer)]);
  assert.deepEqual(f.producers,['/radar LA1234']);
  await f.press(replacement,'✖️ Cancelar'); assert.match(f.answers.at(-1),/expirou/);
});

test('expired question is retired before a newer question can be cancelled',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar'); f.expire();
  await f.input(f.makeInput('LA1234',old)); assert.equal(f.producers.length,0);
  assert.deepEqual(f.messages.get(old.message_id).reply_markup.inline_keyboard,[]);
  const current=await openQuestion(f,'🌤️ METAR'); await f.press(old,'✖️ Cancelar');
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/metar SBGR']);
});

test('answer/cancel race claims its question once and cannot cancel the next one',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar'); const answer=f.makeInput('LA1234',old);
  await Promise.all([f.input(answer),f.press(old,'✖️ Cancelar'),f.input(answer)]);
  assert(f.producers.length<=1); assert(f.producers.every(x=>x==='/radar LA1234'));
  const current=await openQuestion(f,'🌤️ METAR'); await f.press(old,'✖️ Cancelar');
  await f.input(f.makeInput('SBGR',current)); assert.equal(f.producers.at(-1),'/metar SBGR');
});

test('delayed cleanup of consumed answer never deletes a newer question',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar');
  let release; const gate=new Promise(resolve=>{release=resolve;}); f.pauseCleanup(gate);
  const before=f.count('editMessageReplyMarkup'); const pending=f.input(f.makeInput('LA1234',old));
  while(f.count('editMessageReplyMarkup')===before) await new Promise(resolve=>setTimeout(resolve,0));
  f.pauseCleanup(null); const current=await openQuestion(f,'🌤️ METAR');
  await f.press(old,'✖️ Cancelar'); release(); await pending;
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/radar LA1234','/metar SBGR']);
});

for(const kind of ['🌤️ METAR','🌤️ TAF']) test(`real ${kind} keyboard emits a valid new return ticket`,async()=>{
  const f=fixture(); const prompt=await openQuestion(f,kind);
  await f.input(f.makeInput('SBGR',prompt)); const result=structuredClone(f.latest());
  const back=result.reply_markup.inline_keyboard.flat().find(x=>/Voltar ao menu/.test(x.text));
  assert(back?.callback_data?.startsWith('cc_nav:v1:'));
  const weather=result.reply_markup.inline_keyboard.flat().filter(x=>x.callback_data?.startsWith('cc_weather:'));
  assert(weather.some(x=>x.callback_data.includes(':SBGR:raw')));
  const sends=f.count('sendMessage');
  await f.dispatch({callback_query:{id:'old-legacy',data:'cc_nav:menu',from:{id:101},message:result}});
  assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
  await f.press(result,back.text); assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='📅 Programação'));
  assert.equal(f.messages.get(result.message_id).text,result.text);
});

test('real call confirmation return is ticketed without invoking a call',async()=>{
  const f=fixture(); await f.callPrompt(); const result=structuredClone(f.latest());
  const buttons=result.reply_markup.inline_keyboard.flat();
  assert(buttons.some(x=>x.callback_data==='cc_call:confirm'));
  assert(buttons.some(x=>x.callback_data==='cc_call:cancel'));
  const back=buttons.find(x=>/Voltar ao menu/.test(x.text)); assert(back.callback_data.startsWith('cc_nav:v1:'));
  await f.press(result,back.text); assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='📅 Programação'));
  assert.equal(f.producers.length,0,'no call producer or finance action');
});


test('cancel during prompt delivery gives busy feedback and remains usable',async()=>{
  const f=fixture(); let release; const gate=new Promise(resolve=>{release=resolve;}); f.pausePrompt(gate);
  const opening=openQuestion(f,'📡 Radar');
  while(!f.latest()?.reply_markup?.inline_keyboard?.flat().some(x=>x.text==='✖️ Cancelar')) await new Promise(resolve=>setTimeout(resolve,0));
  const prompt=structuredClone(f.latest()); await f.press(prompt,'✖️ Cancelar'); assert.match(f.answers.at(-1),/Aguarde/);
  release(); await opening; await f.press(prompt,'✖️ Cancelar');
  assert(f.latest().reply_markup.inline_keyboard.flat().some(x=>x.text==='📅 Programação'));
  assert.equal(f.producers.length,0);
});

test('late delivery of superseded replacement cannot revive its cancellation ticket',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar');
  let release; const gate=new Promise(resolve=>{release=resolve;}); f.pausePrompt(gate);
  const pending=f.input(f.makeInput('invalid',old));
  while(f.latest().message_id===old.message_id) await new Promise(resolve=>setTimeout(resolve,0));
  const delayed=structuredClone(f.latest()); f.pausePrompt(null);
  const current=await openQuestion(f,'🌤️ METAR'); release(); await pending;
  const sends=f.count('sendMessage'); await f.press(delayed,'✖️ Cancelar');
  assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
  await f.input(f.makeInput('SBGR',current)); assert.deepEqual(f.producers,['/metar SBGR']);
});


test('reordered plain Cancelar from before current prompt cannot cancel it',async()=>{
  const f=fixture(); const old=await openQuestion(f,'📡 Radar');
  const stale=f.makeInput('✖️ Cancelar'); const current=await openQuestion(f,'🌤️ METAR');
  await f.input(stale); await f.input(f.makeInput('SBGR',current));
  assert.deepEqual(f.producers,['/metar SBGR']);
  assert(stale.message_id<current.message_id);
});


for(const text of ['/emergencia','SOS','🚨 Emergência','🚨 Emergência','Ajuda','/ajuda','Menu','/menu','HELP','/emergencia@CrewCheckBot']) {
  for(const replyToOther of [false,true]) test(`priority ${text} reaches downstream router with old reply: ${replyToOther}`,async()=>{
    const f=fixture(); const prompt=await openQuestion(f,'📡 Radar');
    const message=f.makeInput(text,replyToOther?{message_id:1}:null);
    await f.handoff(message);
    assert.equal(f.routes.length,1,'actual prepared process must pass priority input downstream');
    assert.equal(f.routes[0].text,text); assert.equal(f.producers.length,0);
    const sends=f.count('sendMessage'); await f.press(prompt,'✖️ Cancelar');
    assert.match(f.answers.at(-1),/expirou/); assert.equal(f.count('sendMessage'),sends);
    assert.equal(await f.input(f.makeInput('LA1234',prompt)),false,'interrupted question cannot resume');
  });
}

for(const other of ['foreign-sender','other-chat','group-chat']) test(`priority from ${other} cannot retire another private question`,async()=>{
  const f=fixture(); const prompt=await openQuestion(f,'📡 Radar');
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
  const f=fixture(); const prompt=await openQuestion(f,'📡 Radar');f.expire();
  await f.handoff(f.makeInput(text,{message_id:1}));
  assert.equal(f.routes.length,1);assert.equal(await f.input(f.makeInput('LA1234',prompt)),false);
  const current=await openQuestion(f,'🌤️ METAR');await f.press(prompt,'✖️ Cancelar');
  assert.equal(await f.input(f.makeInput('SBGR',current)),true);
  assert.deepEqual(f.producers,['/metar SBGR']);
});

test('ordinary answer attached to old message remains ignored without interrupting current question',async()=>{
  const f=fixture();const prompt=await openQuestion(f,'📡 Radar');
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


for(const publicProfile of ['missing','revoked','lookup-failure','linked']) for(const [report,kind]of[['🌤️ METAR','metar'],['🌤️ TAF','taf'],['📻 ATIS','metar']])test(`public ${report} controls survive profile ${publicProfile}`,async()=>{
  const f=fixture({publicProfile});const keyboard=f.weather('SBGR',kind);
  const expected=JSON.parse(JSON.stringify(keyboard.inline_keyboard.flat().filter(b=>b.callback_data?.startsWith('cc_weather:'))));
  assert.equal(expected.length,5,'real current producer must expose all public controls');
  await f.emit(`${report} synthetic public report`,keyboard);
  const result=structuredClone(f.latest());const buttons=result.reply_markup.inline_keyboard.flat();
  assert.deepEqual(buttons.filter(b=>b.callback_data?.startsWith('cc_weather:')),expected,'labels, report kind, station and modes must remain exact');
  const nav=buttons.filter(b=>b.callback_data?.startsWith('cc_nav:'));
  if(publicProfile==='linked'){
    assert.equal(nav.length,1);assert.match(nav[0].callback_data,/^cc_nav:v1:[a-f0-9]{24}:home$/);
    await f.press(result,nav[0].text);assert(f.latest().reply_markup.inline_keyboard.flat().some(b=>b.text==='📅 Programação'));
  }else{
    assert.equal(nav.length,0,'only unavailable private return is removed');
    assert.equal(f.count('sendMessage'),1,'no migration/root side-message for public unbound report');
  }
  assert.equal(f.producers.length,0,'no weather fetch/call/account producer is invoked by decoration');
});

for(const publicProfile of ['missing','revoked','lookup-failure'])test(`private root remains unavailable with profile ${publicProfile}`,async()=>{
  const f=fixture({publicProfile});await f.root();
  assert.equal(f.latest().reply_markup.remove_keyboard,true);
  assert(!f.latest().reply_markup.inline_keyboard,'public weather exception cannot mint a private root ticket');
});


test('inline symbol labels retain ordered actions, layout and existing app destinations', () => {
  const contracts = {
    home: ['programacao', 'hoteis', 'transporte', 'financeiro', 'diarias', 'regulamentacao', 'more', 'emergencia', 'refresh'],
    programacao: ['hoje', 'amanha', 'proximo', 'escala', 'radar', 'portao', 'home', 'home'],
    transporte: ['saida', 'home', 'home'],
    regulamentacao: ['conformidade', 'home', 'home'],
    more: ['weather', 'wellness', 'home', 'home'],
    weather: ['metar', 'taf', 'atis', 'more', 'home'],
    wellness: ['hospitais', 'farmacias', 'academias', 'rotina', 'more', 'home'],
    hoteis: ['historico_pernoites', 'informar_hotel', 'adicionar_quarto', 'home', 'home'],
    duty: ['duty_basis', 'regulamentacao', 'home'],
    duty_details: ['duty_summary', 'home'],
    finance: ['finance_details', 'home', 'home'],
    financeiro: ['financeiro_details', 'home', 'home'],
    finance_details: ['diarias', 'home'],
    financeiro_details: ['financeiro', 'home'],
  };
  assert.deepEqual(menuTemplate().inline_keyboard.map(row => row.map(button => button.text)),
    [['📅 Programação', '🏨 Pernoite'], ['🚗 Transporte', '💰 Financeiro'], ['🧾 Diárias', '📖 Regulamentação'], ['➕ Mais', '🚨 Emergência'], ['🔄 Atualizar']]);
  for (const [page, actions] of Object.entries(contracts)) {
    const markup = menuTemplate(page);
    assert.deepEqual(Object.keys(markup), ['inline_keyboard'], 'no persistent bottom keyboard');
    assert(markup.inline_keyboard.every(row => row.length <= 2));
    const buttons = markup.inline_keyboard.flat();
    assert.deepEqual(buttons.filter(button => button.callback_data).map(button => button.callback_data),
      actions.map(action => `cc_nav:entry:${action}`));
    for (const button of buttons) {
      assert.match(button.text, /^[^\p{L}]+ \p{L}/u, 'symbol precedes readable name');
      assert(!/[\u0000-\u001f\u200b-\u200d\u2060\ufeff/]/u.test(button.text), 'no hidden text or slash');
      if (button.callback_data) assert(Buffer.byteLength(button.callback_data) <= 64);
    }
  }
  assert.equal(menuTemplate('finance').inline_keyboard[0][0].url, 'https://crewcheck.online/?view=perdiem');
  assert.equal(menuTemplate('hoteis').inline_keyboard[0][0].url, 'https://crewcheck.online/?view=hotels');
});

test('categories invoke only the selected existing handler and preserve result on return', async () => {
  const f = fixture();
  for (const [category, label, command, context] of [
    ['📅 Programação','📅 Hoje','/hoje','📅 Hoje'], ['📅 Programação','📆 Amanhã','/amanha','✈️ Escala'],
    ['📅 Programação','⏭️ Próxima','/proximo','📅 Hoje'], ['📅 Programação','✈️ Escala','/escala','📅 Hoje'],
    ['🚗 Transporte','🚗 Saída','/saida','🚗 Saída'], ['🏨 Pernoite','🕘 Histórico','/historico_pernoites','🕘 Histórico'],
    ['🏨 Pernoite','📝 Hotel no app','/informar_hotel','🕘 Histórico'], ['🏨 Pernoite','🛏️ Quarto no app','/adicionar_quarto','🕘 Histórico'],
  ]) {
    await f.root(); await f.press(f.latest(),category); const before=f.producers.length;
    await f.press(f.latest(),label); assert.equal(f.producers.length,before+1); assert.equal(f.producers.at(-1),command);
    assert(f.latest().reply_markup.inline_keyboard.flat().some(b=>b.text===context));
    const result=structuredClone(f.latest()); await f.press(result,'🏠 Início'); assert.equal(f.messages.get(result.message_id).text,result.text);
  }
});

test('short financial states disclose details on touch without reading a source or invoking a producer',async()=>{
  const f=fixture();
  for(const label of ['💰 Financeiro','🧾 Diárias']) {
    await f.root(); await f.press(f.latest(),label); const summary=f.latest().text;
    assert(summary.length<160); assert.match(summary,/indisponíveis/); assert(!summary.includes('pernoites'));
    await f.press(f.latest(),'🔎 Detalhes'); assert.match(f.latest().text,/fonte autorizada/);
    await f.press(f.latest(),'↩️ Voltar'); assert.equal(f.latest().text,summary); await f.press(f.latest(),'🏠 Início');
  }
  assert.deepEqual(f.producers,[]); assert.deepEqual(f.snapshotReads,[]); assert(f.requests.every(r=>!r.body.reply_markup?.keyboard));
});

test('refresh rereads existing snapshot once and rotates controls without running any other producer',async()=>{
  const f=fixture(); await f.root(); const old=structuredClone(f.latest());
  await Promise.all([f.press(old,'🔄 Atualizar'),f.press(old,'🔄 Atualizar')]);
  assert.deepEqual(f.snapshotReads,['synthetic@example.test']); assert.deepEqual(f.producers,[]); assert.match(f.latest().text,/Menu atualizado/);
  await f.press(old,'📅 Programação'); assert.match(f.answers.at(-1),/expirou/);
  await f.press(f.latest(),'📅 Programação'); await f.press(f.latest(),'📅 Hoje'); assert.deepEqual(f.producers,['/hoje']);
});

for(const change of ['revoke','relink']) test(`refresh ${change} during read cannot deliver a new menu`,async()=>{
  const f=fixture(); await f.root(); const old=structuredClone(f.latest()),sends=f.count('sendMessage');
  f.onSnapshot(()=>f[change]()); await f.press(old,'🔄 Atualizar'); assert.equal(f.count('sendMessage'),sends); assert.deepEqual(f.producers,[]);
  await f.press(old,'🔄 Atualizar'); assert.equal(f.snapshotReads.length,1);
});

for(const stage of ['snapshot','producer']) test(`owner change during ${stage} cannot deliver former-owner output`,async()=>{
  const f=fixture(); await f.root(); await f.press(f.latest(),'📅 Programação'); const nav=structuredClone(f.latest()),sends=f.count('sendMessage');
  if(stage==='snapshot')f.onSnapshot(()=>f.relink()); else f.onReply(()=>f.relink());
  await f.press(nav,'📅 Hoje'); assert.equal(f.count('sendMessage'),sends); assert.equal(f.producers.length,stage==='snapshot'?0:1);
});


for (const alias of ['Hotéis', 'hoteis', '🏨 Hotéis', 'Meu pernoite', '🏨 Meu pernoite']) {
  for (const question of ['🌤️ METAR', '🌤️ TAF', '📻 ATIS', '📡 Radar', '🚪 Portão']) for (const replyMode of ['none', 'current', 'old']) {
    test(`public stay alias ${alias} interrupts ${question}, reply ${replyMode}`, async () => {
      const f = fixture(), prompt = await openQuestion(f, question);
      await f.handoff(f.makeInput(alias, replyMode === 'old' ? { message_id: 1 } : replyMode === 'current' ? prompt : null));
      assert.equal(f.routes.length, 1, 'supported alias must reach the existing downstream handler');
      assert.equal(f.routes[0].text, alias); assert.deepEqual(f.producers, []);
      const original = f.routes[0].text;
      const command = materialized ? vm.runInNewContext(`${extract(producerSource, 'normalizeConciergeButtonText')}; normalizeConciergeButtonText(input)`, { input: original }) : original;
      if (materialized) assert.equal(command, '/hoteis', 'actual materialized alias normalizer');
      const result = await stayMenuReply(command, {}, { readHistory: () => { throw Error('No history read allowed'); } });
      assert.equal(result.handled, true); assert.match(result.reply, /Meu pernoite/);
      const sends = f.count('sendMessage'); await f.press(prompt, '✖️ Cancelar');
      assert.match(f.answers.at(-1), /expirou/); assert.equal(f.count('sendMessage'), sends);
      assert.equal(await f.input(f.makeInput(['📡 Radar', '🚪 Portão'].includes(question) ? 'LA1234' : 'SBGR', prompt)), false, 'retired question cannot resume');
    });
  }
}
