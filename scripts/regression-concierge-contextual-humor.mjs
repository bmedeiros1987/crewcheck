import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { decorateConciergeReply as decorate, conciergeHumorContext, conciergeHumorSensitive } from '../server/v14336/concierge-personality.mjs';
import { conciergeFormatTextV14354 as numeric } from '../server/v14354/concierge-language.mjs';
import { buildProgramSummary } from '../server/v1404/telegram-language.mjs';
import { companyTransportReply } from '../server/concierge/company-transport.mjs';

// Synthetic itineraries only. No account, network, notification or TTS request.
const now = new Date('2026-10-05T12:00:00Z');
function program(route = ['GRU', 'BSB']) {
  return { start: new Date('2026-10-05T12:00:00Z'), end: new Date('2026-10-06T07:00:00Z'), startTime: '09:00', endTime: '04:00', legs: route.slice(1).map((destination, index) => ({ flightNumber: `LA00${12 + index}`, origin: route[index], destination, departureTime: index ? '02:00' : '23:00', arrivalTime: index ? '03:00' : '01:00' })) };
}
const render = (record) => buildProgramSummary({ record, includeGreeting: false, label: 'A próxima programação' });
function run(record = program(), options = {}) {
  const reply = render(record);
  return decorate(reply, { roster: { base: 'BSB' }, records: [record], preferences: { mode: 'comic' }, query: '/proximo', intent: 'next', now, random: () => 0, ...options });
}

test('BSB base has return/start/transit framing from this actual program, never monthly frequency or live location', () => {
  for (const [route, kind, phrase] of [
    [['GRU', 'BSB'], 'return', 'termina na sua base, BSB'],
    [['BSB', 'GRU'], 'start', 'BSB abre essa programação'],
    [['GRU', 'BSB', 'CNF'], 'transit', 'Participação especial da base'],
    [['GRU', 'CNF'], 'away', 'GRU → CNF nessa programação'],
  ]) {
    const record = program(route);
    const original = render(record);
    const result = run(record);
    assert.equal(conciergeHumorContext(original, { roster: { base: 'BSB' }, records: [record] }).kind, kind);
    assert.ok(result.humorApplied);
    assert.ok(result.reply.startsWith(original));
    assert.ok(result.reply.includes(phrase));
    assert.doesNotMatch(result.reply, /porta-retrato|visitante frequente|já conhece|de novo|em casa|chegou|você está|turismo|cansad/i);
    const noisy = { base: 'BSB', days: Array.from({ length: 20 }, () => ({ legs: [{ destination: 'MAB' }] })) };
    assert.equal(run(record, { roster: noisy }).reply, result.reply);
  }
});

test('missing, conflicting, stale-account and ambiguous route context stays neutral', () => {
  const record = program();
  for (const options of [{ roster: {} }, { records: [] }, { records: [record, record] }, { records: [program(['REC', 'SSA'])] }, { records: [{ ...record, start: null }] }, { records: [{ ...record, end: '2026-10-01' }] }, { intent: 'unknown' }, { intent: 'departure' }]) assert.equal(run(record, options).humorApplied, false, JSON.stringify(options));
  const broken = program(['GRU', 'BSB', 'CNF']); broken.legs[1].origin = 'REC';
  assert.equal(run(broken).humorApplied, false);
  assert.equal(run(record, { roster: { base: 'GRU' } }).humorKey, 'GRU-start-0', 'new account base is read afresh');
  assert.equal(run(record).humorKey, 'BSB-return-0', 'no module account cache');
  for (const date of ['2026-10-07', '07/10/2026', '07/10']) assert.equal(conciergeHumorContext(`${date}\n${render(record)}`, { roster: { base: 'BSB' }, records: [record] }), null);
  for (const date of ['2026-10-05', '05/10/2026', '05/10']) assert.equal(conciergeHumorContext(`${date}\n${render(record)}`, { roster: { base: 'BSB' }, records: [record] }).kind, 'return');
  const reordered = program(['GRU', 'BSB', 'CNF']);
  const wrongClocks = numeric(render(reordered)).replace('23:00', '02:00').replace('01:00', '03:00');
  assert.equal(conciergeHumorContext(wrongClocks, { roster: { base: 'BSB' }, records: [reordered] }), null, 'times elsewhere cannot support a leg');
  const swapped = numeric(render(record)).replace('23:00', 'TEMP').replace('01:00', '23:00').replace('TEMP', '01:00');
  assert.equal(conciergeHumorContext(swapped, { roster: { base: 'BSB' }, records: [record] }), null, 'departure and arrival roles cannot be swapped');
  const gol = program(); gol.legs[0].flightNumber = 'G30012';
  assert.equal(run(gol).humorApplied, true, 'two-character airline identifiers can include digits');
});

test('formal mode, cooldown, chance and variation retain existing occasional-humor policy', () => {
  const record = program();
  for (const preferences of [{ mode: 'formal' }, { mode: 'comic', lastHumorAt: now.toISOString() }]) assert.equal(run(record, { preferences }).humorApplied, false);
  assert.equal(run(record, { random: () => 0.9 }).humorApplied, false);
  const second = run(record, { preferences: { mode: 'comic', lastHumorKey: 'BSB-return-0' } });
  assert.equal(second.humorKey, 'BSB-return-1');
  assert.match(second.reply, /última palavra/);
});

test('serious requests, grief and silence suppress humor transiently without diagnosing or saving', () => {
  for (const query of ['Hoje não quero conversa, qual o próximo voo?', 'Preciso ficar quieto hoje, qual o próximo voo?', 'Estou de luto, qual meu próximo voo?', 'Não estou de luto', 'O que significa "luto" na escala?', 'Preciso de silêncio', 'Sem piadas hoje', 'Não quero brincadeiras', 'Fale sério', 'Não estou bem', 'Perdi minha mãe', 'Meu pai faleceu', 'Estou cansado', 'Emergência no voo', 'Qual o limite de jornada?', 'Tenho uma cobrança', 'Qual o portão?', 'qual a saída de casa?', 'meu voo foi cancelado']) {
    const result = run(program(), { query, ...(query.includes('saída') ? { intent: 'departure' } : {}) });
    assert.equal(result.humorApplied, false, query);
    assert.equal(result.reply, render(program()));
  }
  for (const reply of ['Há erro na consulta.', 'A chegada está a confirmar.', 'Alerta crítico.', 'Não foi confirmado.', 'Qual é o voo?']) assert.equal(decorate(reply, { preferences: { mode: 'comic' }, intent: 'next', records: [program()], roster: { base: 'BSB' }, random: () => 0 }).humorApplied, false);
  assert.equal(run(program(), { suppressHumor: true }).humorApplied, false);
  assert.equal(run().humorApplied, true, 'suppression never mutates mode or subsequent calls');
});

const wrapper = fs.readFileSync('scripts/v14408/reply-wrapper.snippet', 'utf8');
async function runtime({ days = [], query = '/proximo', dateKey = '', care = true, base = 'BSB', clock = now } = {}) {
  const record = program();
  let options;
  const saved = [];
  const context = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } }, Intl,
    stayMenuReply: async () => ({ handled: false }), companyTransportReply,
    pharmacyReferenceReply: async () => ({ handled: false }),
    conciergeLoadSnapshot: () => null, conciergeStayRecords: () => [], conciergeLocationContextV14335: () => ({ fresh: false }),
    conciergePreferenceCommandV14336: async () => ({ handled: false }),
    conciergeSemanticInputContextV14338: () => null,
    interpretConciergeNaturalTextV14338: () => ({ intent: 'next', dateKey }),
    isWellhubPlanPreferenceMessage: () => false, isWellhubPlanDeclarationMessage: () => false, isWellhubActivityPreferenceMessage: () => false,
    conciergeSafeKey: (value) => value, isConciergeContextFreshV14338: () => false,
    normalizeConciergeNaturalTextV14338: (value) => value, conciergeSemanticResolveV14338: async () => ({ handled: true, reply: render(record) }),
    conciergeSemanticFindRecordV14338: () => ({ record }), conciergeSemanticRecordExtraV14338: () => ({}), buildConciergeContextV14338: () => ({}),
    conciergeSaveSnapshotAsync: async (...args) => { saved.push(args); return null; },
    conciergePreferencesV14336: () => ({ mode: 'comic' }), conciergeProgramRecords: () => [record],
    decorateConciergeReplyV14336: (reply, opts) => { options = opts; return decorate(reply, { ...opts, now, random: () => 0 }); },
    conciergeFinalizeReplyV14354: (reply) => reply, conciergeHumanizeReplyV14408: (reply) => reply,
  };
  // Same existing Care authority is supplied by canonical preparation.
  vm.createContext(context);
  const serverSource = fs.readFileSync('server.mjs', 'utf8');
  const dateHelper = serverSource.match(/function conciergeRosterDayParts\([\s\S]*?\n}/)?.[0];
  assert.ok(dateHelper);
  vm.runInContext(dateHelper, context);
  if (care) {
    const careGenerator = fs.readFileSync('scripts/p0-691-care-context/apply.mjs', 'utf8');
    const declaration = careGenerator.match(/const serverCareFunctions = `[\s\S]*?`;/)?.[0];
    assert.ok(declaration, 'use existing Care materializer, not a parallel code classifier');
    vm.runInContext(`${declaration}\nthis.careSource = serverCareFunctions;`, context);
    vm.runInContext(context.careSource, context);
  }
  const start = serverSource.indexOf('async function buildTelegramConciergeReply(');
  const end = serverSource.indexOf('async function buildTelegramConciergeReplyCore(', start);
  const actualWrapper = process.env.CREWCHECK_TEST_PREPARED === '1' ? serverSource.slice(start, end) : wrapper;
  assert.ok(actualWrapper.includes('records: conciergeProgramRecords'), 'execute final contextual wrapper');
  vm.runInContext(`${actualWrapper}\nthis.run = buildTelegramConciergeReply;`, context);
  const result = await context.run(query, { email: 'synthetic@example.invalid', channel: 'app' }, { roster: { base, days } });
  return { result, options, saved };
}
test('actual wrapper consumes current Care authority, scoped date and current account; missing authority fails closed', async () => {
  const dmo = { year: 2026, month: 10, dayNumber: 5, type: 'DMO' };
  for (const config of [{ days: [dmo] }, { days: [{ ...dmo, dayNumber: 7 }], dateKey: '2026-10-07' }, { care: false }, { query: 'Estou de luto' }]) {
    const value = await runtime(config);
    assert.equal(value.result, render(program()));
    assert.ok(value.saved.every((args) => !JSON.stringify(args).includes('lastHumorAt')));
  }
  const value = await runtime({ days: [{ ...dmo, dayNumber: 4 }] });
  assert.match(value.result, /créditos finais/);
  assert.equal(value.options.query, '/proximo');
  assert.equal(value.options.intent, 'next');
  assert.match((await runtime({ base: 'GRU' })).result, /créditos de abertura/);
  assert.equal((await runtime({ days: [dmo], clock: new Date('2026-10-06T02:59:59Z') })).result, render(program()), 'before Brazil midnight remains quiet');
  assert.match((await runtime({ days: [dmo], clock: new Date('2026-10-06T03:00:00Z') })).result, /créditos finais/, 'past Care day does not become a persistent profile');
  assert.equal((await runtime({ days: [{ ...dmo, type: 'DO', pairingCode: 'DMO' }] })).result, render(program()), 'formal parser fallback Care code is preserved');
  assert.match((await runtime({ days: [{ ...dmo, type: 'DO', notes: 'DMO luto' }] })).result, /créditos finais/, 'arbitrary roster notes never classify grief');
});

test('canonical wrapper owner keeps contextual arguments, and prepared actual server does too', () => {
  const generator = fs.readFileSync('scripts/v14408/apply.mjs', 'utf8');
  assert.match(generator, /scripts\/v14408\/reply-wrapper\.snippet/);
  assert.match(generator, /replaceBetween\([\s\S]*?replyWrapper/);
  const helper = generator.match(/function replaceBetween\([\s\S]*?\n}/)?.[0];
  const invocation = generator.match(/  next = replaceBetween\([\s\S]*?replyWrapper,[\s\S]*?\n  \);/)?.[0];
  assert.ok(helper && invocation);
  const prepare = (source) => {
    const scope = { next: source, replyWrapper: wrapper.trim() };
    vm.runInNewContext(`${helper}\n${invocation}`, scope);
    return scope.next;
  };
  const source = 'async function buildTelegramConciergeReply() { return "old"; }\n\nasync function buildTelegramConciergeReplyCore() {}';
  const first = prepare(source);
  assert.ok(first.includes(wrapper.trim()));
  assert.equal(prepare(first), first, 'exact existing wrapper materializer is byte-idempotent');
  if (process.env.CREWCHECK_TEST_PREPARED === '1') {
    const server = fs.readFileSync('server.mjs', 'utf8');
    const contextualBlock = wrapper.slice(wrapper.indexOf('  const decorated ='), wrapper.indexOf('  if (decorated.humorApplied)'));
    assert.ok(contextualBlock.includes('suppressHumor:'));
    assert.ok(server.includes(contextualBlock), 'final prepared runtime must preserve the exact contextual authority block');
    // The existing POI materializer legitimately adds an early lookup to this
    // wrapper. Its surrounding composition is exercised by runtime() above.
    assert.match(server, /const poi = await pharmacyReferenceReply/);
  }
});
