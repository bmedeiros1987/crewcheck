import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createTelegramMenuTransport } from '../server/concierge/telegram-menu-transport.mjs';
import { createTelegramMenu, menuTemplate, requestedWeatherAirport } from '../server/concierge/telegram-menu.mjs';
import { execFileSync } from 'node:child_process';
import {
  normalizeConciergeNaturalTextV14341 as normalizeConciergeNaturalTextV14338,
  interpretConciergeNaturalTextV14341 as interpretConciergeNaturalTextV14338,
  buildConciergeContextV14341 as buildConciergeContextV14338,
  isConciergeContextFreshV14341 as isConciergeContextFreshV14338,
} from '../server/v14341/concierge-semantic.mjs';
import { stayMenuReply } from '../server/concierge/stay-menu.mjs';
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
let source = read(process.env.CONCIERGE_ROUTING_SOURCE || 'server.mjs');
let whatsapp = read('server/whatsapp.mjs');
if (!materialized) {
  // Assemble actual committed wrapper/core/semantic/persistence/channel sources,
  // then run the real Wellhub materializer. This is not a substitute for the
  // --materialized run after the full production npm build in CI.
  const core = read('server/v1403/build-reply.snippet').replace('async function buildTelegramConciergeReply(', 'async function buildTelegramConciergeReplyCore(');
  const semanticHelpers = read('scripts/v14338/reply-wrapper.snippet').split('async function buildTelegramConciergeReply(')[0];
  source = source.replace(extract(source, 'buildTelegramConciergeReply'), [semanticHelpers, read('scripts/v14336/server-preferences.snippet'), read('scripts/v14408/reply-wrapper.snippet'), core].join('\n'));
  source = source.replace(extract(source, 'handleTelegramConciergeAsk'), read('scripts/v14336/concierge-ask.snippet'));
  const appFinalizer = read('scripts/p1-concierge-poi/apply.mjs');
  const appCall = appFinalizer.match(/const appCall = "([^"\n]+)";/)[1];
  const scopedAppCall = appFinalizer.match(/const scopedAppCall = "([^"\n]+)";/)[1];
  source = source.replace(appCall, scopedAppCall);
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

if (materialized) {
  assert.match(source, /from '\.\/server\/v14341\/concierge-semantic\.mjs'/, 'test uses the same semantic module as production');
  assert.match(source, /stayMenuReply\(text, profile\)/, 'compiled outer adapter remains in the tested path');
  assert.match(source, /pharmacyReferenceReply\(text, profile, currentSnapshot/, 'compiled pharmacy adapter remains in the tested path');
}

const clone = x => JSON.parse(JSON.stringify(x));
export function harness({ realFortalezaCatalog = false, operationalProbe = false } = {}) {
  const profile = { email: 'route-a@example.invalid', name: 'Synthetic A', chatId: '9001', linked: true, authenticated: true };
  if (operationalProbe) Object.assign(profile, { channel: 'telegram', chatType: 'private' });
  const other = { ...profile, email: 'route-b@example.invalid', name: 'Synthetic B', chatId: '9002' };
  let activeProfile = profile;
  let local = { snapshots: { [profile.email]: { key: profile.email, email: profile.email, name: profile.name, roster: { base: 'GRU', days: [] }, preferences: { gymPlan: 'wellhub', wellhubPlan: 'basic', mode: 'formal', preferredName: 'Synthetic A', onboardingStep: 'complete' } } } };
  local.snapshots[other.email] = { ...clone(local.snapshots[profile.email]), key: other.email, email: other.email, name: other.name };
  const database = new Map(Object.values(local.snapshots).map(value => [`snapshot:${value.key}`, clone(value)]));
  const trace = { input: [], core: [], gyms: [], saves: [], search: [], output: [], transports: [], voices: [] };
  let sequence = 100;
  const partner = { id: 'synthetic', name: 'Synthetic gym', city: 'Guarulhos', state: 'SP', minimumPlan: 'basic', activities: ['Pilates'], openingHours: [], sourceUrl: 'https://example.invalid/synthetic' };
  let appResponse;
  const context = vm.createContext({
    crewcheckMenu: createTelegramMenu({}),
    requestedWeatherAirport,
    normalizeConciergeNaturalTextV14338, interpretConciergeNaturalTextV14338, buildConciergeContextV14338, isConciergeContextFreshV14338,
    ...wellhub, ...preferences, ...language, ...human, ...premium, ...intents,
    normalizeConciergePreferencesV14336: personality.normalizeConciergePreferences,
    publicConciergeVoiceCatalogV14336: personality.publicConciergeVoiceCatalog,
    normalizeConciergeVoiceProfileV14336: personality.normalizeConciergeVoiceProfile,
    decorateConciergeReplyV14336: personality.decorateConciergeReply,
    pharmacyReferenceReply, stayMenuReply,
    process: { env: {} }, console,
    telegramRostersRead: () => clone(local),
    telegramRostersWrite: value => { local = clone(value); return true; },
    conciergeDbPut: async (key, value) => { database.set(key, clone(value)); return true; },
    conciergeDbGet: async key => database.has(key) ? clone(database.get(key)) : null,
    conciergeCurrentStay: () => null, conciergeStayRecords: () => [],
    conciergeProgramRecords: () => [], conciergeNextProgram: () => null,
    conciergeNextJourneyProgram: () => null, conciergeJourneyProgramRecords: () => [],
    conciergeLocationContextV14335: () => ({ fresh: true, location: realFortalezaCatalog ? { city: 'Fortaleza', state: 'CE' } : { city: 'Guarulhos', state: 'SP' } }),
    WEATHER_AIRPORT_POINTS: { GRU: { city: 'Guarulhos' } },
    searchVerifiedWellhub: async input => {
      trace.search.push(clone(input));
      return realFortalezaCatalog ? wellhub.searchVerifiedWellhub({ ...input, live: false, now: new Date('2026-10-10T18:05:00Z') }) : [partner];
    },
    handleTelegramWeatherCallback: async () => false, handleTelegramCallCallback: async () => false,
    handleV139Telegram: async () => false, handlePlatformVisitorTelegram: async () => false,
    telegramTryBindFromWebhook: async () => false, telegramMessagePdfDocument: () => null,
    telegramProfileForChatAsync: async () => activeProfile,
    sendTelegramChatAction: async () => {}, sendTelegramMessage: async (_chat, reply, extra = {}) => {
      const prepared = operationalProbe ? await context.crewcheckMenu.markup(_chat, extra) : extra;
      const result = { message_id: ++sequence, date: Math.floor(Date.now() / 1000) };
      trace.output.push(reply); trace.transports.push({ chat: _chat, reply, extra: prepared, result });
      return { ok: true, data: { result } };
    },
    conciergeKeyboard: {}, conciergeFunctionKeyboard: {}, conciergeSettingsKeyboard: {}, airportIcao: () => '',
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
    'normalizeConciergeButtonText', 'conciergePreferencesV14336', 'conciergeVoiceOptionsV14336', 'conciergePreferenceSummaryV14336', 'conciergePreferenceCommandV14336',
    'conciergeSemanticInputContextV14338', 'conciergeSemanticCommandIntentV14338', 'conciergeSemanticFindRecordV14338', 'conciergeSemanticRecordExtraV14338', 'conciergeSemanticRecordKeyV14338', 'conciergeSemanticClarificationV14338', 'conciergeSemanticResolveV14338',
    'conciergeIdentityFlow', 'conciergeEasterEggNormalize', 'conciergeEasterEggPick', 'conciergeEasterEggReply',
    'conciergeGymsReply', 'buildTelegramConciergeReplyCore', 'buildTelegramConciergeReply', 'processTelegramUpdate', 'handleTelegramConciergeAsk',
  ];
  for (const name of ['normalizeCrewCheckNaturalLanguage', 'conciergeCareCode', 'conciergeCareState', 'conciergeCarePresentation', 'conciergeDateKey', 'conciergeDayForKey', 'conciergeReplyKeyboard', 'conciergeContextualRoutineReply']) {
    if (source.includes(`function ${name}(`)) functions.push(name);
  }
  for (const name of functions) vm.runInContext(extract(source, name), context);
  if (operationalProbe) {
    const next = { legs: [{ flightNumber: 'LA9999', origin: 'SBBR', destination: 'SBSP' }] };
    const event = flight => ({ kind: 'flight', flightNumber: flight, origin: 'SBGR', destination: 'SBSP', startDateTime: '2026-10-19T12:00:00Z' });
    Object.assign(context, {
      conciergeNextProgram: () => next,
      conciergeRecordDateKey: () => '2026-10-19',
      conciergeContextualRoutineReply: () => '',
      conciergeFindFlight: (_roster, requested) => { trace.input.push({ boundary: 'findFlight', requested }); return { leg: next.legs[0] }; },
      normalizeFlightRaw: value => value.replace(/\s/g, ''),
      buildFlightContext: flight => ({ raw: flight, iata: flight }),
      buildCanonicalRosterEvents: () => [event('LA1234'), event('LA9999')],
      findPublishedGateLeg: (_roster, query) => ({ identity: { eventId: 'synthetic-event', flight: query.flight }, leg: { flightNumber: query.flight, origin: 'SBGR', destination: 'SBSP' } }),
      originFlightDate: () => '2026-10-19', gateQueryDay: () => ({ allowed: true }),
      gateQuerySuppressed: () => ({ message: 'Dados sintéticos insuficientes' }),
      runRadarRace: async query => { trace.search.push({ boundary: 'radar', flight: query.raw }); return { ok: true, status: 'SYNTHETIC', gate: '', departure: '09:00', arrival: '10:00' }; },
      conciergeApplyRadar: () => {}, airportIcao: value => /^[A-Z]{4}$/.test(value) ? value : '',
      fetchAviationWeatherReport: async (station, type) => { trace.search.push({ boundary: 'weather', station, type }); return { ok: true, raw: 'SYNTHETIC REPORT', source: 'fixture', cache: 'live' }; },
      decodeTafPtBr: () => ['Fixture TAF'], decodeMetarPtBr: () => ['Fixture METAR'],
      buildCrewCheckAtis: station => `ATIS meteorológico ${station} · fixture`,
      crewCheckAtisVoiceText: reply => `Voz: ${reply}`,
      sendHumanTelegramVoiceReply: async (chat, text, _query, snapshot) => trace.voices.push({ chat, text, owner: snapshot.email }),
      answerTelegramCallback: async () => {}, createTelegramMenu, requestedWeatherAirport, createTelegramMenuTransport,
      telegramApiUrl: () => '', // This harness probes producers; edit I/O is covered by telegram-navigation-reuse.
      openEmergencyTelegramMenu: async () => { throw Error('emergency entry is tested separately with its actual handler'); },
      conciergeKeyboard: menuTemplate(),
    });
    for (const name of ['conciergeExtractFlight', 'conciergeRadarReply', 'conciergeWeatherReply', 'conciergeAtisReply', 'conciergeWeatherKeyboard']) vm.runInContext(extract(source, name), context);
    const runtimeStart = source.indexOf('const crewcheckMenu = createTelegramMenu(');
    const runtimeEnd = source.indexOf('\n});', runtimeStart) + 4;
    assert.ok(runtimeStart >= 0 && runtimeEnd > runtimeStart, 'actual prepared menu runtime');
    vm.runInContext(source.slice(runtimeStart, runtimeEnd).replace('const crewcheckMenu =', 'globalThis.crewcheckMenu ='), context);
  }
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
    setRoster: (roster, preferences = {}) => { local.snapshots[profile.email].roster = clone(roster); local.snapshots[profile.email].preferences = { ...local.snapshots[profile.email].preferences, ...clone(preferences) }; },
    load: async (owner = profile) => clone(await context.conciergeLoadSnapshot(owner)),
    seed: preferences => { local.snapshots[profile.email].preferences = { ...local.snapshots[profile.email].preferences, ...clone(preferences) }; },
    restart: () => { local = { snapshots: {} }; },
    openInline: () => context.sendTelegramMessage(profile.chatId, 'Menu de teste', { reply_markup: menuTemplate() }),
    tap: async label => {
      const last = trace.transports.at(-1);
      const button = last.extra.reply_markup.inline_keyboard.flat().find(item => item.text.replace(/^[^\p{L}]+/u, '') === label);
      assert.ok(button?.callback_data, label);
      await context.processTelegramUpdate({ callback_query: { id: `callback-${sequence}`, data: button.callback_data, from: { id: profile.chatId }, message: { chat: { id: profile.chatId, type: 'private' }, ...last.result } } });
    },
    send: async (channel, text, owner = profile) => {
      activeProfile = owner;
      trace.input.push({ channel, text });
      if (channel === 'telegram') await context.processTelegramUpdate({ message: { chat: { id: owner.chatId, type: 'private' }, from: { id: owner.chatId }, text, message_id: ++sequence, date: Math.floor(Date.now() / 1000) } });
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
      assert.match(first, /Academias .*Basic/);
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

  test(`${channel}: legacy context requires product naming; /wellhub establishes account-scoped footer context`, async () => {
    const legacy = harness();
    legacy.seed({ conciergeConversation: { lastIntent: 'gym', updatedAt: new Date().toISOString() } });
    assert.match(await legacy.send(channel, 'Meu plano é silver+'), /Você está falando do Wellhub/);
    assert.equal((await legacy.load()).preferences.wellhubPlan, 'basic');
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
  for (const phrase of ['Wellhub não quero Pilates', 'Wellhub quero Pilates para meu amigo', 'Meu amigo disse Wellhub quero Pilates', 'Wellhub modalidade Pilates para meu amigo', 'Wellhub modalidade Pilates quando eu puder', 'Wellhub modalidade Pilates do João', 'Wellhub atividade da minha irmã', 'Wellhub modalidade Pilates caso eu possa']) {
    await h.send('app', phrase);
    assert.equal((await h.load()).preferences.gymActivity, undefined);
  }
});

test('prepared full handler preserves explicit flight/station and weather kind through normalizer, semantics and actual producers', { skip: !materialized }, async () => {
  const cases = [
    ['/radar LA1234', 'radar', 'LA1234'], ['/portao LA1234', 'radar', 'LA1234'],
    ['/metar SBGR raw', 'weather', 'SBGR', 'metar'], ['/taf SBGR raw', 'weather', 'SBGR', 'taf'],
    ['/atis SBGR', 'atis', 'SBGR'], ['radar do voo LA1234', 'radar', 'LA1234'], ['ATIS de SBGR', 'atis', 'SBGR'],
    ['/metar KJFK raw', 'weather', 'KJFK', 'metar'], ['/taf SCEL raw', 'weather', 'SCEL', 'taf'],
    ['/atis FACT', 'atis', 'FACT'], ['METAR de KJFK', 'weather', 'KJFK', 'metar'], ['ATIS de SCEL', 'atis', 'SCEL'],
  ];
  for (const [text, kind, expected, weatherType] of cases) {
    const h = harness({ operationalProbe: true });
    const snapshot = await h.load();
    await h.context.buildTelegramConciergeReply(text, h.profile, snapshot);
    if (kind === 'radar') assert.equal(h.trace.search.find(item => item.boundary === 'radar')?.flight, expected, `${text} reaches actual Radar producer with requested flight, not roster fallback LA9999`);
    else {
      const reports = h.trace.search.filter(item => item.boundary === 'weather');
      assert.ok(reports.length > 0, text);
      assert.ok(reports.every(item => item.station === expected), `${text} keeps explicit station instead of fallback SBBR`);
      assert.deepEqual(reports.map(item => item.type).sort(), kind === 'atis' ? ['metar', 'taf'] : [weatherType]);
    }
  }
});

test('prepared Telegram slash and guided buttons call the same actual producers, weather keyboard and ATIS voice adapter', { skip: !materialized }, async () => {
  for (const [label, command, input] of [['Radar', 'radar', 'LA1234'], ['Portão', 'portao', 'LA1234'], ['METAR', 'metar', 'SBGR'], ['TAF', 'taf', 'SBGR'], ['ATIS', 'atis', 'SBGR'], ['METAR', 'metar', 'KJFK'], ['TAF', 'taf', 'SCEL'], ['ATIS', 'atis', 'FACT']]) {
    const slash = harness({ operationalProbe: true });
    await slash.send('telegram', `/${command} ${input}`);
    const guided = harness({ operationalProbe: true });
    await guided.openInline(); await guided.tap(['radar', 'portao'].includes(command) ? 'Programação' : 'Mais');
    if (['metar', 'taf', 'atis'].includes(command)) await guided.tap('Meteorologia');
    await guided.tap(label); await guided.send('telegram', input);
    assert.deepEqual(guided.trace.search.filter(item => item.boundary), slash.trace.search.filter(item => item.boundary), `${command} IO-boundary arguments`);
    assert.equal(guided.trace.output.at(-1), slash.trace.output.at(-1), `${command} actual formatted response`);
    assert.deepEqual(guided.trace.voices, slash.trace.voices, `${command} deterministic voice effect parity`);
    if (['metar', 'taf'].includes(command)) {
      const stableKeyboard = markup => {
        const copy=clone(markup);
        for(const button of copy.inline_keyboard.flat()) if(button.callback_data?.startsWith('cc_nav:')) {
          assert.match(button.callback_data,/^cc_nav:v1:[a-f0-9]{24}:home$/, 'fresh return must be an issued ticket');
          button.callback_data='cc_nav:v1:<nonce>:home';
        }
        return copy;
      };
      assert.deepEqual(stableKeyboard(guided.trace.transports.at(-1).extra.reply_markup), stableKeyboard(slash.trace.transports.at(-1).extra.reply_markup), `${command} exact weather controls and ticketed return`);
    }
    assert.equal(slash.trace.voices.length, command === 'atis' ? 1 : 0);
  }
});

test('prepared full handler ATIS reaches both actual weather reads for the requested station', { skip: !materialized }, async () => {
  const h = harness({ operationalProbe: true });
  await h.context.buildTelegramConciergeReply('/atis SBGR', h.profile, await h.load());
  const reports = h.trace.search.filter(item => item.boundary === 'weather');
  assert.deepEqual(reports.map(item => [item.station, item.type]).sort(), [['SBGR', 'metar'], ['SBGR', 'taf']]);
});

test('prepared settings/direct weather transitions remove only persistent keyboards and keep weather controls', { skip: !materialized }, async () => {
  for (const settingsFirst of [false, true]) {
    const h = harness({ operationalProbe: true });
    // Use the actual settings keyboard declaration from the prepared source.
    const at = source.indexOf('const conciergeSettingsKeyboard = {');
    const end = source.indexOf('\n};', at) + 3;
    assert.ok(at >= 0 && end > at);
    vm.runInContext(source.slice(at, end).replace('const conciergeSettingsKeyboard =', 'globalThis.conciergeSettingsKeyboard ='), h.context);
    if (settingsFirst) {
      await h.send('telegram', '/configuracoes');
      assert.ok(h.trace.transports.at(-1).extra.reply_markup.keyboard);
    }
    const before = h.trace.transports.length;
    await h.send('telegram', '/metar SBGR');
    const transition = h.trace.transports.slice(before);
    assert.equal(transition.length, 2, 'separate ReplyKeyboardRemove precedes first weather inline');
    assert.equal(transition[0].extra.reply_markup.remove_keyboard, true);
    assert.ok(transition[1].extra.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'cc_weather:metar:SBGR:raw'));
    assert.ok(transition[1].extra.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'cc_weather:metar:SBGR:decoded'));
    const weatherBefore = h.trace.transports.length;
    await h.send('telegram', '/taf SBGR');
    assert.equal(h.trace.transports.length, weatherBefore + 1, 'weather-to-weather does not repeatedly remove input');
    for (const reply_markup of [{ force_reply: true, selective: true }, { keyboard: [[{ text: 'Enviar localização', request_location: true }]], one_time_keyboard: true }]) {
      const count = h.trace.transports.length;
      await h.context.sendTelegramMessage(h.profile.chatId, 'Entrada explícita', { reply_markup });
      assert.equal(h.trace.transports.length, count + 1);
      assert.deepEqual(clone(h.trace.transports.at(-1).extra.reply_markup), reply_markup);
    }
  }
});


test('fresh Wellhub context is bound to the trusted account and originating channel', async () => {
  for (const from of ['app', 'telegram', 'whatsapp']) {
    for (const to of ['app', 'telegram', 'whatsapp'].filter(value => value !== from)) {
      const h = harness();
      await h.send(from, '/academias');
      const context = (await h.load()).preferences.conciergeConversation;
      assert.equal(context.gymContextChannel, from);
      assert.equal(context.gymContextOwner, h.profile.email);
      assert.match(await h.send(to, 'Meu plano é silver+'), /Você está falando do Wellhub/);
      assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
      assert.match(await h.send(to, 'Meu plano Wellhub é Silver+'), /Plano Wellhub atualizado para Silver\+/);
    }
  }
  const h = harness();
  await h.send('app', '/academias');
  const forged = (await h.load()).preferences.conciergeConversation;
  h.seed({ conciergeConversation: { ...forged, gymContextOwner: h.other.email } });
  assert.match(await h.send('app', 'Meu plano é silver+'), /Você está falando do Wellhub/);
  assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
});


test('neutral replies cannot revalidate expired, legacy, foreign-owner or cross-channel Wellhub context', async () => {
  for (const neutral of ['Obrigado', 'Certo', 'Hmm']) {
    for (const from of ['app', 'telegram', 'whatsapp']) {
      for (const to of ['app', 'telegram', 'whatsapp'].filter(value => value !== from)) {
        const h = harness(); await h.send(from, '/academias');
        await h.send(to, neutral);
        assert.match(await h.send(to, 'Meu plano é silver+'), /Você está falando do Wellhub/);
        assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
      }
    }
    for (const invalid of ['expired', 'owner', 'legacy']) {
      const h = harness(); await h.send('app', '/academias');
      const previous = (await h.load()).preferences.conciergeConversation;
      if (invalid === 'expired') previous.updatedAt = '2000-01-01';
      if (invalid === 'owner') previous.gymContextOwner = h.other.email;
      if (invalid === 'legacy') { delete previous.gymContextOwner; delete previous.gymContextChannel; }
      h.seed({ conciergeConversation: previous });
      await h.send('app', neutral);
      assert.match(await h.send('app', 'Meu plano é silver+'), /Você está falando do Wellhub/);
      assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
    }
  }
});

test('known multiword and legacy single-token activity names remain valid without accepting clauses', async () => {
  for (const [phrase, expected] of [['Wellhub modalidade dança de salão', 'Dança de salão'], ['Wellhub modalidade artes marciais', 'Artes marciais'], ['Wellhub modalidade Aquagym', 'Aquagym']]) {
    const h = harness();
    const reply = await h.send('app', phrase);
    assert.match(reply, /Modalidade Wellhub atualizada/);
    assert.equal((await h.load()).preferences.gymActivity, expected);
  }
  const h = harness(); await h.send('app', '/academias');
  await h.send('app', 'meu plano Netflix é Gold');
  assert.match(await h.send('app', 'Meu plano é silver+'), /Você está falando do Wellhub/);
  assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
});


test('interrupted name onboarding cannot consume explicit or contextual Wellhub preferences', async () => {
  for (const channel of ['telegram', 'whatsapp', 'app']) {
    for (const onboardingStep of ['ask-user-name', 'ask-concierge-name']) {
      const h = harness(); h.seed({ onboardingStep, premiumAccess: true, conciergeName: 'Synthetic Concierge' });
      await h.send(channel, '/academias');
      assert.match(await h.send(channel, 'Meu plano é silver+'), /Plano Wellhub atualizado para Silver\+/);
      const saved = (await h.load()).preferences;
      assert.equal(saved.wellhubPlan, 'silver-plus');
      assert.equal(saved.preferredName, 'Synthetic A');
      assert.equal(saved.conciergeName, 'Synthetic Concierge');
      assert.equal(saved.onboardingStep, onboardingStep);
      assert.match(await h.send(channel, 'Meu plano Wellhub é Gold'), /Plano Wellhub atualizado para Gold/);
      assert.equal((await h.load()).preferences.preferredName, 'Synthetic A');
      assert.match(await h.send(channel, 'Meu plano Wellhub é Premium'), /Não reconheci o plano Wellhub informado/);
      assert.equal((await h.load()).preferences.preferredName, 'Synthetic A');
      assert.equal((await h.load()).preferences.conciergeName, 'Synthetic Concierge');
      await h.send(channel, '/meunome Academia');
      assert.equal((await h.load()).preferences.preferredName, 'Academia', 'explicit name commands retain identity precedence');
    }
  }
});


test('unrelated name replies still use the pending identity flow', async () => {
  for (const [onboardingStep, phrase, field] of [['ask-user-name', 'Alex', 'preferredName'], ['ask-concierge-name', 'Aurora', 'conciergeName']]) {
    const h = harness(); h.seed({ onboardingStep, premiumAccess: true });
    await h.send('app', phrase);
    assert.equal((await h.load()).preferences[field], phrase);
    assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
  }
});

test('Fortaleza official catalog through actual Telegram, WhatsApp and app routing', async () => {
  for (const channel of ['telegram', 'whatsapp', 'app']) {
    const h = harness({ realFortalezaCatalog: true });
    h.seed({ wellhubPlan: 'silver-plus' });
    for (const text of ['/academias', 'academia em Fortaleza/CE', 'academia Greenlife']) {
      const reply = await h.send(channel, text);
      assert.match(reply, /Academias · Fortaleza\/CE · Silver\+/);
      assert.equal((reply.match(/compatível com Silver\+ pelo cadastro/g) || []).length, text.endsWith('Greenlife') ? 2 : 4);
      assert.match(reply, /Fortaleza\/CE/);
      assert.doesNotMatch(reply, /Brasília|\/DF|\/SP/);
      assert.equal(h.trace.gyms.at(-1), text);
      assert.equal(h.trace.search.at(-1).locationText, 'Fortaleza CE');
      assert.equal(h.trace.search.at(-1).plan, 'silver-plus');
    }
  }
});
