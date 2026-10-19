import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createTelegramMenu, menuTemplate, menuGreeting, hotelsUrl } from '../../server/concierge/telegram-menu.mjs';
import { createTelegramMenuTransport } from '../../server/concierge/telegram-menu-transport.mjs';

const materialized = process.argv.includes('--materialized');
const source = materialized ? fs.readFileSync('server.mjs', 'utf8') : '';
function fixture() {
  let menu, context, id = 100, time = 1_000_000, linked = true;
  const messages = new Map(), requests = [], answers = [], producers = [];
  let editMode = 'ok', clearFails = false, pauseEdit = null, pauseAfterEdit = null, profileHook = null;
  const profile = () => { profileHook?.(); return { linked, channel: 'telegram', chatType: 'private', chatId: '101', email: 'synthetic@example.test', accessKeyHash: 'fixture-binding' }; };
  const fetch = async (url, options) => {
    const method = url.split('/').at(-1), body = JSON.parse(options.body); requests.push({ method, body });
    if (method === 'editMessageText' && pauseEdit) await pauseEdit;
    if (method === 'editMessageText' && editMode === 'http') return { ok: false, json: async () => ({ ok: false }) };
    if (method === 'editMessageText' && editMode === 'throw') throw Error('synthetic timeout');
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
    if (method === 'editMessageText' && pauseAfterEdit) await pauseAfterEdit;
    if (method === 'editMessageText' && editMode === 'applied-throw') throw Error('synthetic uncertain delivery');
    return { ok: true, status: 200, json: async () => ({ ok: true, result: structuredClone(result) }) };
  };
  const snapshot = async () => ({ owner: 'synthetic' });
  const reply = async command => { producers.push(command); return command === '/historico_pernoites' ? 'Histórico sintético: registro salvo.' : `Resultado útil ${command}`; };
  const answer = async (id, text) => answers.push(text);
  const apiUrl = method => `https://fixture.invalid/${method}`;
  let root, dispatch;
  if (materialized) {
    const fn = name => { const match = source.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n}`)); assert(match, name); return match[0]; };
    const runtime = source.match(/const crewcheckMenu = createTelegramMenu\([\s\S]*?\n}\);/)[0];
    assert(runtime.includes('...createTelegramMenuTransport('));
    context = vm.createContext({ createTelegramMenu: deps => createTelegramMenu(deps, () => time), createTelegramMenuTransport, telegramApiUrl: apiUrl, fetch,
      telegramProfileForChatAsync: async () => profile(), conciergeLoadSnapshot: snapshot, buildTelegramConciergeReply: reply,
      answerTelegramCallback: answer, conciergeWeatherKeyboard: () => ({}), conciergeSettingsKeyboard: {} });
    vm.runInContext([fn('sendTelegramMessage'), runtime, fn('processTelegramUpdate')].join('\n'), context);
    root = () => { context.rootMarkup = menuTemplate(); context.rootText = menuGreeting(); return vm.runInContext('sendTelegramMessage(101, rootText, {reply_markup:rootMarkup})', context); };
    dispatch = update => context.processTelegramUpdate(update);
  } else {
    const send = async (chatId, text, extra) => {
      extra = await menu.markup(chatId, extra); if (extra === null) return { ok: false };
      const response = await fetch(apiUrl('sendMessage'), { body: JSON.stringify({ chat_id: chatId, text, ...extra }) });
      return { ok: true, data: await response.json() };
    };
    menu = createTelegramMenu({ ...createTelegramMenuTransport({ apiUrl, fetch }), profile: async () => profile(), snapshot, reply, answer, send }, () => time);
    root = () => send(101, menuGreeting(), { reply_markup: menuTemplate() });
    dispatch = update => menu.callback(update);
  }
  const latest = () => [...messages.values()].at(-1);
  const callback = (message, label, from = 101) => ({ callback_query: { id: `fixture-${requests.length}`, from: { id: from }, message: structuredClone(message),
    data: message.reply_markup.inline_keyboard.flat().find(button => button.text === label).callback_data } });
  const press = (message, label, from) => dispatch(callback(message, label, from));
  const count = method => requests.filter(x => x.method === method).length;
  return { root, latest, press, callback, dispatch, messages, requests, answers, producers, count,
    expire: () => { time += 16 * 60_000; }, mode: value => { editMode = value; }, clearFailure: () => { clearFails = true; },
    pause: promise => { pauseEdit = promise; }, pauseAfter: promise => { pauseAfterEdit = promise; }, revoke: () => { linked = false; }, profileHook: fn => { profileHook = fn; } };
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
