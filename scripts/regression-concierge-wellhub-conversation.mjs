import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import * as semantic from '../server/v14338/concierge-semantic.mjs';
import * as wellhub from '../server/v14407/wellhub.mjs';
import * as preferences from '../server/v14410/wellhub-concierge.mjs';
import * as personality from '../server/v14336/concierge-personality.mjs';
import * as language from '../server/v14354/concierge-language.mjs';
import * as human from '../server/v14408/concierge-human.mjs';
import * as premium from '../server/v1403/telegram-human.mjs';
import * as intents from '../server/v1404/telegram-language.mjs';
import { pharmacyReferenceReply } from '../server/concierge/pharmacy-reference.mjs';

const read = file => fs.readFileSync(file, 'utf8');
function extract(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, name);
  return source.slice(start, end);
}
const materialized = process.argv.includes('--materialized');
let source = read('server.mjs');
let whatsapp = read('server/whatsapp.mjs');
if (!materialized) {
  // Assemble actual committed wrapper/core/semantic/persistence/channel sources,
  // then run the real Wellhub materializer. This is not a substitute for the
  // --materialized run after the full production npm build in CI.
  const core = read('server/v1403/build-reply.snippet').replace('async function buildTelegramConciergeReply(', 'async function buildTelegramConciergeReplyCore(');
  const semanticHelpers = read('scripts/v14338/reply-wrapper.snippet').split('async function buildTelegramConciergeReply(')[0];
  source = source.replace(extract(source, 'buildTelegramConciergeReply'), [semanticHelpers, read('scripts/v14336/server-preferences.snippet'), read('scripts/v14408/reply-wrapper.snippet'), core].join('\n'));
  source = source.replace(extract(source, 'handleTelegramConciergeAsk'), read('scripts/v14336/concierge-ask.snippet'));
  source += '\n' + extract(read('server/v1403/premium-helpers.snippet'), 'conciergeIdentityFlow');
  const wellhubImport = read('scripts/v14410/apply.mjs').match(/const wellhubImport = "([^"\n]+)";/)[1];
  source = wellhubImport + '\n' + source;
  source = source.replace('http.createServer', "configureWhatsAppConcierge(async ({ email, text }) => {\n  return '';\n});\n\nhttp.createServer");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wellhub-conversation-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts/v14410'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
    for (const name of ['apply.mjs', 'concierge-gyms.snippet']) fs.copyFileSync(`scripts/v14410/${name}`, path.join(dir, `scripts/v14410/${name}`));
    fs.writeFileSync(path.join(dir, 'server.mjs'), source);
    fs.writeFileSync(path.join(dir, 'server/whatsapp.mjs'), whatsapp);
    execFileSync(process.execPath, ['scripts/v14410/apply.mjs'], { cwd: dir, stdio: 'pipe' });
    source = read(path.join(dir, 'server.mjs'));
    whatsapp = read(path.join(dir, 'server/whatsapp.mjs'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const clone = x => JSON.parse(JSON.stringify(x));
function harness() {
  const profile = { email: 'route-a@example.invalid', name: 'Synthetic A', chatId: '9001', linked: true, authenticated: true };
  const other = { ...profile, email: 'route-b@example.invalid', name: 'Synthetic B', chatId: '9002' };
  let activeProfile = profile;
  let local = { snapshots: { [profile.email]: { key: profile.email, email: profile.email, name: profile.name, roster: { base: 'GRU', days: [] }, preferences: { gymPlan: 'wellhub', wellhubPlan: 'basic', mode: 'formal', preferredName: 'Synthetic A', onboardingStep: 'complete' } } } };
  local.snapshots[other.email] = { ...clone(local.snapshots[profile.email]), key: other.email, email: other.email, name: other.name };
  const database = new Map(Object.values(local.snapshots).map(value => [`snapshot:${value.key}`, clone(value)]));
  const trace = { input: [], core: [], gyms: [], saves: [], search: [], output: [] };
  const partner = { id: 'synthetic', name: 'Synthetic gym', city: 'Guarulhos', state: 'SP', minimumPlan: 'basic', activities: ['Pilates'], openingHours: [], sourceUrl: 'https://example.invalid/synthetic' };
  let appResponse;
  const context = vm.createContext({
    ...semantic, ...wellhub, ...preferences, ...language, ...human, ...premium, ...intents,
    normalizeConciergePreferencesV14336: personality.normalizeConciergePreferences,
    publicConciergeVoiceCatalogV14336: personality.publicConciergeVoiceCatalog,
    normalizeConciergeVoiceProfileV14336: personality.normalizeConciergeVoiceProfile,
    decorateConciergeReplyV14336: personality.decorateConciergeReply,
    pharmacyReferenceReply,
    process: { env: {} }, console,
    telegramRostersRead: () => clone(local),
    telegramRostersWrite: value => { local = clone(value); return true; },
    conciergeDbPut: async (key, value) => { database.set(key, clone(value)); return true; },
    conciergeDbGet: async key => database.has(key) ? clone(database.get(key)) : null,
    conciergeCurrentStay: () => null, conciergeStayRecords: () => [],
    conciergeProgramRecords: () => [], conciergeNextProgram: () => null,
    conciergeNextJourneyProgram: () => null, conciergeJourneyProgramRecords: () => [],
    conciergeLocationContextV14335: () => ({ fresh: true, location: { city: 'Guarulhos', state: 'SP' } }),
    WEATHER_AIRPORT_POINTS: { GRU: { city: 'Guarulhos' } },
    searchVerifiedWellhub: async input => { trace.search.push(clone(input)); return [partner]; },
    handleTelegramWeatherCallback: async () => false, handleTelegramCallCallback: async () => false,
    handleV139Telegram: async () => false, handlePlatformVisitorTelegram: async () => false,
    telegramTryBindFromWebhook: async () => false, telegramMessagePdfDocument: () => null,
    telegramProfileForChatAsync: async () => activeProfile,
    sendTelegramChatAction: async () => {}, sendTelegramMessage: async (_chat, reply) => { trace.output.push(reply); },
    conciergeKeyboard: {}, airportIcao: () => '',
    readJsonBody: async req => req.body, telegramRequestUser: () => activeProfile,
    telegramAppRequestAllowed: () => true, conciergeAccessMatches: () => true,
    telegramLinkedRecordForEmail: async () => ({ chatId: activeProfile.chatId }),
    sendJson: (_res, status, body) => { appResponse = { status, body }; },
    normalizePhone: value => String(value || ''), phoneNumberId: () => 'synthetic-receiver',
    findActiveLinkByPhone: async () => ({ email: activeProfile.email, consent_concierge: 1, linked_at: '2026-01-01' }),
    sendWhatsAppText: async (_to, reply) => { trace.output.push(reply); return { ok: true }; },
    configureWhatsAppConcierge: handler => { context.whatsappConciergeHandler = handler; },
    fetch: () => { throw Error('No external calls in this synthetic conversation regression'); },
  });
  const functions = [
    'conciergeSafeKey', 'conciergeSnapshotForProfile', 'conciergeMinimizeRoster', 'conciergeRosterDiagnostics', 'conciergeSaveSnapshot', 'conciergeSaveSnapshotAsync', 'conciergeLoadSnapshot',
    'normalizeConciergeButtonText', 'conciergePreferencesV14336', 'conciergeVoiceOptionsV14336', 'conciergePreferenceCommandV14336',
    'conciergeSemanticInputContextV14338', 'conciergeSemanticCommandIntentV14338', 'conciergeSemanticFindRecordV14338', 'conciergeSemanticRecordExtraV14338', 'conciergeSemanticRecordKeyV14338', 'conciergeSemanticClarificationV14338', 'conciergeSemanticResolveV14338',
    'conciergeIdentityFlow', 'conciergeEasterEggNormalize', 'conciergeEasterEggPick', 'conciergeEasterEggReply',
    'conciergeGymsReply', 'buildTelegramConciergeReplyCore', 'buildTelegramConciergeReply', 'processTelegramUpdate', 'handleTelegramConciergeAsk',
  ];
  for (const name of functions) vm.runInContext(extract(source, name), context);
  for (const [name, events] of [['buildTelegramConciergeReplyCore', 'core'], ['conciergeGymsReply', 'gyms']]) {
    const actual = context[name];
    context[name] = (...args) => { trace[events].push(name === 'conciergeGymsReply' ? args[1] : args[0]); return actual(...args); };
  }
  const actualSave = context.conciergeSaveSnapshotAsync;
  context.conciergeSaveSnapshotAsync = (...args) => { trace.saves.push(clone(args[2] || {})); return actualSave(...args); };
  const binding = source.match(/configureWhatsAppConcierge\(async \(\{ email, text(?:, location)? \}\) => \{[\s\S]*?\n\}\);/);
  assert.ok(binding, 'real WhatsApp binding is present');
  vm.runInContext(binding[0], context);
  vm.runInContext(extract(whatsapp, 'handleInboundMessage'), context);
  return {
    trace, context, profile, other,
    load: async (owner = profile) => clone(await context.conciergeLoadSnapshot(owner)),
    seed: preferences => { local.snapshots[profile.email].preferences = { ...local.snapshots[profile.email].preferences, ...clone(preferences) }; },
    restart: () => { local = { snapshots: {} }; },
    send: async (channel, text, owner = profile) => {
      activeProfile = owner;
      trace.input.push({ channel, text });
      if (channel === 'telegram') await context.processTelegramUpdate({ message: { chat: { id: owner.chatId }, text } });
      else if (channel === 'whatsapp') await context.handleInboundMessage({ from: owner === profile ? '5511000000000' : '5511000000001', text, type: 'text', id: String(trace.input.length), phoneNumberId: 'synthetic-receiver' });
      else { await context.handleTelegramConciergeAsk({ method: 'POST', body: { text } }, {}); assert.equal(appResponse.status, 200); trace.output.push(appResponse.body.reply); }
      return trace.output.at(-1);
    },
  };
}

for (const channel of ['telegram', 'whatsapp', 'app']) {
  test(`${channel}: actual gym response → every advertised footer phrase → save → next request`, async () => {
    for (const [phrase, key, wanted] of [['Meu plano é silver+', 'wellhubPlan', 'silver-plus'], ['uso Gold', 'wellhubPlan', 'gold'], ['quero Pilates', 'gymActivity', 'Pilates']]) {
      const h = harness();
      const first = await h.send(channel, '/academias');
      assert.match(first, /seu plano Basic/);
      assert.match(first, /meu plano é Silver\+/);
      assert.equal((await h.load()).preferences.conciergeConversation.lastIntent, 'gym');
      const reply = await h.send(channel, phrase);
      assert.doesNotMatch(reply, /Qual detalhe|seu plano Basic/);
      assert.match(reply, /atualizad[oa]/);
      assert.equal(h.trace.core.at(-1), phrase, 'core receives original text, not /academias');
      assert.equal(h.trace.gyms.at(-1), phrase, 'gym handler receives the exact preference');
      assert.equal((await h.load()).preferences[key], wanted);
      h.restart();
      await h.send(channel, '/academias');
      const expected = key === 'wellhubPlan' ? { plan: wanted } : { activity: wanted };
      for (const [field, value] of Object.entries(expected)) assert.equal(h.trace.search.at(-1)[field], value);
      if (phrase === 'Meu plano é silver+') console.log('Synthetic Wellhub routing evidence: ' + JSON.stringify({ channel, input: h.trace.input, core: h.trace.core, gyms: h.trace.gyms, confirmation: reply, nextSearchPlan: h.trace.search.at(-1).plan, savedPlan: (await h.load()).preferences.wellhubPlan }));
    }
  });

  test(`${channel}: migrated Wellhub context and /wellhub support footer replies without leaking to another account`, async () => {
    const legacy = harness();
    legacy.seed({ conciergeConversation: { lastIntent: 'gym', updatedAt: new Date().toISOString() } });
    assert.match(await legacy.send(channel, 'Meu plano é silver+'), /Plano Wellhub atualizado para Silver\+/);
    const h = harness();
    await h.send(channel, '/wellhub');
    assert.match(await h.send(channel, 'Meu plano é silver+', h.other), /Você está falando do Wellhub/);
    assert.equal((await h.load(h.other)).preferences.wellhubPlan, 'basic');
    assert.match(await h.send(channel, 'Meu plano é silver+'), /Plano Wellhub atualizado para Silver\+/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'silver-plus');
  });

  test(`${channel}: product-tagged plan declarations and changes retain Silver+ through the full dispatcher`, async () => {
    for (const phrase of ['Meu plano Wellhub é o Silver+', 'Gostaria de alterar meu plano Wellhub para Silver+', 'Quero mudar meu plano Wellhub de Gold para Basic']) {
      const h = harness();
      const reply = await h.send(channel, phrase);
      assert.match(reply, /Plano Wellhub atualizado/);
      assert.match(reply, /no CrewCheck/);
      assert.equal(h.trace.core.at(-1), phrase);
      assert.equal(h.trace.gyms.at(-1), phrase);
      assert.equal((await h.load()).preferences.wellhubPlan, phrase.endsWith('Basic') ? 'basic' : 'silver-plus');
    }
  });

  test(`${channel}: unscoped, expired and other-product context cannot update a Wellhub preference`, async () => {
    for (const previous of [null, { lastIntent: 'gym', gymProvider: 'wellhub', updatedAt: '2000-01-01' }, { lastIntent: 'gym', gymProvider: 'smartfit', updatedAt: new Date().toISOString() }, { lastIntent: 'billing', gymProvider: 'wellhub', updatedAt: new Date().toISOString() }]) {
      const h = harness(); h.seed({ conciergeConversation: previous });
      const reply = await h.send(channel, 'Meu plano é silver+');
      assert.match(reply, /Você está falando do Wellhub/);
      assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
      assert.equal(h.trace.gyms.length, 0);
    }
    const h = harness();
    await h.send(channel, '/academias');
    for (const phrase of ['meu plano CrewCheck é Silver+', 'meu plano de saúde é Silver+']) {
      await h.send(channel, phrase);
      assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
    }
    assert.match(await h.send(channel, 'Meu plano é silver+'), /Você está falando do Wellhub/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
  });
}

test('preserving gym text also preserves location and prevents negated/third-party activity writes', async () => {
  const h = harness();
  await h.send('app', 'academia em Guarulhos/SP');
  assert.equal(h.trace.gyms.at(-1), 'academia em Guarulhos/SP');
  for (const phrase of ['Wellhub não quero Pilates', 'Wellhub quero Pilates para meu amigo', 'Meu amigo disse Wellhub quero Pilates']) {
    await h.send('app', phrase);
    assert.equal((await h.load()).preferences.gymActivity, undefined);
  }
});
