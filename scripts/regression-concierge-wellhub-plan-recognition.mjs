import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import test from 'node:test';
import {
  detectWellhubActivityFromText, detectWellhubPlanFromText,
  isWellhubPlanServer, wellhubPlanAllows, wellhubPlanLabelServer,
} from '../server/v14407/wellhub.mjs';
import * as preferences from '../server/v14410/wellhub-concierge.mjs';

const server = fs.readFileSync('server.mjs', 'utf8');
function actualFunction(name) {
  const start = server.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `actual ${name} must exist`);
  const end = server.indexOf('\n}', start) + 2;
  assert.ok(end > start, `${name} must end`);
  return server.slice(start, end);
}
const materialized = process.argv.includes('--materialized');
const gyms = materialized ? actualFunction('conciergeGymsReply') : fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
if (materialized) {
  assert.match(server, /import \{[^\n]*isWellhubPlanDeclarationMessage[^\n]*\} from '\.\/server\/v14410\/wellhub-concierge\.mjs'/);
  assert.match(gyms, /isWellhubPlanDeclarationMessage/);
}

const clone = value => JSON.parse(JSON.stringify(value));
function harness(initialPlan = 'basic', gymPlan = 'wellhub', io = {}) {
  const profile = { email: 'wellhub-a@example.invalid', name: 'Synthetic A' };
  const other = { email: 'wellhub-b@example.invalid', name: 'Synthetic B' };
  const initial = p => ({ key: p.email, email: p.email, roster: { base: 'GRU', days: [] }, preferences: { gymPlan, wellhubPlan: initialPlan, unrelated: 'keep' } });
  let local = { snapshots: { [profile.email]: initial(profile), [other.email]: initial(other) } };
  const database = new Map(Object.values(local.snapshots).map(value => [`snapshot:${value.key}`, clone(value)]));
  const writes = [], searches = [];
  const partners = [
    { id: 'synthetic-basic', name: 'Synthetic Basic gym', city: 'Guarulhos', state: 'SP', minimumPlan: 'basic', activities: [], openingHours: [], sourceUrl: 'https://example.invalid/synthetic-basic' },
    { id: 'synthetic-silver-plus', name: 'Synthetic Silver+ gym', city: 'Guarulhos', state: 'SP', minimumPlan: 'silver-plus', activities: [], openingHours: [], sourceUrl: 'https://example.invalid/synthetic-silver-plus' },
    { id: 'synthetic-gold', name: 'Synthetic Gold gym', city: 'Guarulhos', state: 'SP', minimumPlan: 'gold', activities: [], openingHours: [], sourceUrl: 'https://example.invalid/synthetic-gold' },
  ];
  const context = vm.createContext({
    ...preferences, detectWellhubActivityFromText, detectWellhubPlanFromText,
    isWellhubPlanServer, wellhubPlanLabelServer,
    telegramRostersRead: () => clone(local),
    telegramRostersWrite: data => {
      if (io.localWrite === 'throw') throw new Error('synthetic local write failure');
      if (io.localWrite === false) return false;
      local = clone(data); return true;
    },
    conciergeDbPut: async (key, value) => {
      writes.push({ key, value: clone(value) });
      if (io.dbWrite === 'throw') throw new Error('synthetic database write failure');
      if (io.dbWrite === false) return false;
      database.set(key, clone(value)); return true;
    },
    conciergeDbGet: async key => {
      if (io.dbRead === 'throw') throw new Error('synthetic database read failure');
      if (io.dbRead === false) return null;
      return database.has(key) ? clone(database.get(key)) : null;
    },
    conciergeCurrentStay: () => null,
    conciergeNextProgram: () => null,
    conciergeLocationContextV14335: () => ({ fresh: true, location: { city: 'Guarulhos', state: 'SP' } }),
    WEATHER_AIRPORT_POINTS: { GRU: { city: 'Guarulhos' } },
    searchVerifiedWellhub: async input => { searches.push(clone(input)); return partners.filter(p => wellhubPlanAllows(input.plan, p.minimumPlan)); },
    fetch: () => { throw new Error('No real network is permitted by this regression'); },
  });
  for (const name of ['conciergeSafeKey', 'conciergeSnapshotForProfile', 'conciergeMinimizeRoster', 'conciergeRosterDiagnostics', 'conciergeSaveSnapshot', 'conciergeSaveSnapshotAsync', 'conciergeLoadSnapshot']) {
    vm.runInContext(actualFunction(name), context);
  }
  vm.runInContext(gyms, context);
  return {
    context, profile, other, writes, searches,
    send: async text => context.conciergeGymsReply(await context.conciergeLoadSnapshot(profile), text, profile),
    load: async p => clone(await context.conciergeLoadSnapshot(p || profile)),
    restart: () => { local = { snapshots: {} }; },
  };
}

test('exact natural Wellhub declaration keeps the plus tier across accepted spellings', () => {
  for (const [label, plan] of [
    ['Digital', 'digital'], ['Starter', 'starter'], ['Basic', 'basic'], ['Basic+', 'basic-plus'],
    ['Silver', 'silver'], ['Silver+', 'silver-plus'], ['Gold', 'gold'], ['Gold+', 'gold-plus'],
    ['Platinum', 'platinum'], ['Diamond', 'diamond'], ['Diamond+', 'diamond-plus'],
  ]) {
    for (const phrase of [`Meu plano Wellhub é o ${label}`, `meu plano do Gympass é o ${label}.`, `Wellhub: o ${label}!`, `Tenho Wellhub ${label}`]) {
      assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), true, phrase);
      assert.equal(detectWellhubPlanFromText(phrase), plan, phrase);
    }
  }
  for (const phrase of ['Silver +', 'Silver Plus', 'Meu plano Wellhub eh o Silver Plus', 'Meu plano Wellhub é o Silver +', 'meu plano é o Silver+', 'meu plano Wellhub é Silver+', 'Wellhub: Silver+', 'uso Gold', 'tenho Basic+']) {
    assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), true, phrase);
  }
});

test('plan words in gym names, questions, negation and other kinds of plans cannot update the preference', () => {
  for (const phrase of [
    "A Gold's Gym aceita Wellhub?", 'o avião é silver', 'meu plano de saúde é Silver',
    'meu plano de celular é Gold', 'meu plano Silver da Vivo', 'Wellhub Silverstone',
    'O mínimo da unidade Wellhub é Basic', 'Wellhub é o Silver+?', 'Não uso Wellhub Silver+',
    'Meu plano Wellhub não é o Basic', 'Meu plano Wellhub é o Silver++',
    'Meu plano Wellhub é o Goldfish', 'Meu plano Wellhub é Silver+ ou Gold',
  ]) assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), false, phrase);
  for (const phrase of ['Wellhub existe aqui?', 'Wellhub elege academias?', "A Gold's Gym aceita Wellhub?"]) {
    assert.equal(preferences.isWellhubPlanDeclarationMessage(phrase), false, phrase);
  }
});

test('saved Basic is replaced by Silver+, survives reload, and remains distinct from the unit minimum', async () => {
  const h = harness();
  const reply = await h.send('Meu plano Wellhub é o Silver+');
  assert.match(reply, /^Plano Wellhub atualizado para Silver\+ no CrewCheck ✓/);
  assert.match(reply, /Sua assinatura no Wellhub não foi alterada/);
  assert.equal(h.writes.length, 1);
  assert.equal(h.searches.length, 0, 'a plan declaration should confirm the change without searching gyms');
  const saved = await h.load();
  assert.equal(saved.preferences.wellhubPlan, 'silver-plus');
  assert.equal(saved.preferences.unrelated, 'keep');
  assert.equal((await h.load(h.other)).preferences.wellhubPlan, 'basic', 'another account must remain unchanged');
  h.restart();
  assert.equal((await h.load()).preferences.wellhubPlan, 'silver-plus', 'the next request can recover the stored plan');
  const next = await h.send('academia em Guarulhos/SP');
  assert.equal(h.searches[0].plan, 'silver-plus');
  assert.match(next, /seu plano Silver\+/);
  assert.match(next, /incluído no seu Silver\+ · mínimo da unidade: Basic/);
  assert.match(next, /incluído no seu Silver\+ · mínimo da unidade: Silver\+/);
  assert.doesNotMatch(next, /seu plano Basic|seu Basic|Synthetic Gold gym/);
  assert.equal(h.writes.length, 1, 'querying a gym must not overwrite the saved tier');
  assert.equal((await h.load()).preferences.wellhubPlan, 'silver-plus');
});

test('explicit unknown or malformed plan asks for clarification without falling back or saving', async () => {
  for (const saved of ['basic', 'gold-plus', '']) {
    const h = harness(saved);
    for (const phrase of ['Meu plano Wellhub é o Premium', 'Meu plano Wellhub é o Silver++', 'Meu plano Gympass é o Goldfish', 'Wellhub: Gold ou Silver', 'Meu plano Wellhub é o Silver+ e quero academia']) {
      const reply = await h.send(phrase);
      assert.match(reply, /Não reconheci o plano Wellhub informado/);
      assert.doesNotMatch(reply, /atualizado|seu plano Basic|incluído|Wellhub verificado/);
      assert.equal((await h.load()).preferences.wellhubPlan, saved);
    }
    assert.equal(h.writes.length, 0);
    assert.equal(h.searches.length, 0);
  }
});

test('wellhub gym names and unit tier text leave the persisted user plan untouched', async () => {
  const h = harness('silver-plus');
  for (const phrase of ["A Gold's Gym aceita Wellhub?", 'O mínimo da unidade Wellhub é Basic']) {
    const reply = await h.send(phrase);
    assert.match(reply, /seu plano Silver\+/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'silver-plus');
  }
  assert.equal(h.writes.length, 0);
});


test('real materializer upgrades the old import and is byte-idempotent on structural fixtures', () => {
  const apply = fs.readFileSync('scripts/v14410/apply.mjs', 'utf8');
  const wellhubImport = apply.match(/const wellhubImport = "([^"\n]+)";/)?.[1];
  const declarationImport = apply.match(/const declarationConciergeImport = "([^"\n]+)";/)?.[1];
  const oldImport = apply.match(/const previousConciergeImport = "([^"\n]+)";/)?.[1];
  assert.ok(wellhubImport && oldImport && declarationImport);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wellhub-plan-regression-'));
  try {
    fs.mkdirSync(path.join(directory, 'scripts/v14410'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'server'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'scripts/v14410/apply.mjs'), apply);
    fs.copyFileSync('scripts/v14410/concierge-gyms.snippet', path.join(directory, 'scripts/v14410/concierge-gyms.snippet'));
    const fixture = `${wellhubImport}
async function conciergeGymsReply(snapshot) {
  return '';
}
async function conciergeRoutineReply() {
  return '';
}
function buildTelegramConciergeReply(value, profile, snapshot) {
  const lower = value.toLowerCase();
  if (value === '/academias') return conciergeGymsReply(snapshot);
}
configureWhatsAppConcierge(async ({ email, text }) => {
  return '';
});

http.createServer(() => {});
`;
    let expected;
    for (const previous of ['', `${oldImport}\n`, `${declarationImport}\n`]) {
      fs.writeFileSync(path.join(directory, 'server.mjs'), fixture.replace(`${wellhubImport}\n`, `${wellhubImport}\n${previous}`));
      fs.copyFileSync('server/whatsapp.mjs', path.join(directory, 'server/whatsapp.mjs'));
      execFileSync(process.execPath, ['scripts/v14410/apply.mjs'], { cwd: directory, stdio: 'pipe' });
      const first = fs.readFileSync(path.join(directory, 'server.mjs'), 'utf8');
      const whatsapp = fs.readFileSync(path.join(directory, 'server/whatsapp.mjs'), 'utf8');
      assert.equal(first.includes(oldImport), false);
      assert.equal((first.match(/from '\.\/server\/v14410\/wellhub-concierge\.mjs'/g) || []).length, 1);
      assert.match(first, /isWellhubPlanDeclarationMessage/);
      execFileSync(process.execPath, ['--check', 'server.mjs'], { cwd: directory, stdio: 'pipe' });
      execFileSync(process.execPath, ['scripts/v14410/apply.mjs'], { cwd: directory, stdio: 'pipe' });
      assert.equal(fs.readFileSync(path.join(directory, 'server.mjs'), 'utf8'), first);
      assert.equal(fs.readFileSync(path.join(directory, 'server/whatsapp.mjs'), 'utf8'), whatsapp);
      if (expected) assert.equal(first, expected, 'fresh preparation and old-import migration must match');
      expected = first;
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});


const planChanges = [
  ['Gostaria de alterar meu plano Wellhub para Silver+', 'silver-plus'],
  ['Quero mudar meu plano Wellhub para Silver+.', 'silver-plus'],
  ['Eu gostaria de atualizar meu plano do Gympass para Silver Plus!', 'silver-plus'],
  ['Por favor, troque o meu plano Wellhub para o plano Silver +.', 'silver-plus'],
  ['Pode alterar meu plano Wellhub para Silver+, por favor?', 'silver-plus'],
  ['Você poderia mudar meu plano Wellhub para Gold?', 'gold'],
  ['Preciso atualizar meu plano Wellhub para Basic+', 'basic-plus'],
  ['Preciso de atualizar meu plano Wellhub para Basic+', 'basic-plus'],
  ['Atualize meu plano Wellhub no CrewCheck para Diamond+', 'diamond-plus'],
  ['Altere meu plano Wellhub para Basic', 'basic'],
  ['Muda meu plano Wellhub para Gold+', 'gold-plus'],
  ['Atualiza meu plano Wellhub para Platinum', 'platinum'],
  ['Troca meu plano Gympass para Starter', 'starter'],
  ['Alterar meu plano Wellhub para Digital', 'digital'],
  ['Quero trocar meu plano Wellhub de Gold para Basic', 'basic'],
  ['Quero trocar meu plano Wellhub de Basic para Silver+', 'silver-plus'],
];

test('natural explicit plan changes save the requested destination, including downgrades', async () => {
  for (const [phrase, plan] of planChanges) {
    assert.equal(preferences.detectWellhubPlanPreferenceFromText(phrase), plan, phrase);
    assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), true, phrase);
    const h = harness();
    const reply = await h.send(phrase);
    assert.match(reply, new RegExp(`^Plano Wellhub atualizado para ${wellhubPlanLabelServer(plan).replaceAll('+', '\\+')} no CrewCheck`));
    assert.match(reply, /Sua assinatura no Wellhub não foi alterada/);
    assert.doesNotMatch(reply, /Wellhub verificado|incluído/);
    assert.equal(h.searches.length, 0);
    assert.equal((await h.load()).preferences.wellhubPlan, plan);
    assert.equal(h.writes.length, 1);
    h.restart();
    assert.equal((await h.load()).preferences.wellhubPlan, plan);
    await h.send('academia em Guarulhos/SP');
    assert.equal(h.searches[0].plan, plan, phrase);
    assert.equal(h.writes.length, 1);
  }
});

test('unknown or incomplete explicit change requests clarify without saving or searching a fallback plan', async () => {
  for (const phrase of [
    'Gostaria de alterar meu plano Wellhub para Premium',
    'Quero mudar meu plano Wellhub para Silver++',
    'Atualize meu plano Gympass para Goldfish',
    'Troque meu plano Wellhub para Silver+ ou Gold',
    'Quero mudar meu plano Wellhub de Premium para Basic',
    'Gostaria de alterar meu plano Wellhub',
    'Quero mudar meu plano Wellhub para',
  ]) {
    const h = harness('basic', 'smartfit');
    assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), false, phrase);
    const reply = await h.send(phrase);
    assert.match(reply, /Não reconheci o plano Wellhub informado/);
    assert.doesNotMatch(reply, /atualizado|seu plano Basic|incluído|Wellhub verificado/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
    assert.equal((await h.load()).preferences.gymPlan, 'smartfit');
    assert.equal(h.searches.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

test('negation, hypothetical, third-party and unrelated plans cannot change the saved Wellhub tier', async () => {
  for (const phrase of [
    'Não quero mudar meu plano Wellhub para Silver+',
    'Quero não mudar meu plano Wellhub para Silver+',
    'Não altere meu plano Wellhub para Silver+',
    'Se eu mudar meu plano Wellhub para Silver+, quais academias posso usar?',
    'E se eu alterar meu plano Wellhub para Silver+?',
    'Quando eu mudar meu plano Wellhub para Silver+',
    'Gostaria de saber se posso alterar meu plano Wellhub para Silver+',
    'Meu amigo quer alterar meu plano Wellhub para Silver+',
    'Quero mudar o plano Wellhub do João para Silver+',
    'Altere o plano do João no Wellhub para Silver+',
    'Quero alterar meu plano Wellhub para Silver+ se ficar mais barato',
    'Quero mudar meu plano de saúde para Silver+',
    'Quero trocar meu plano de celular para Gold',
    'Quero mudar de academia para a Gold Gym no Wellhub',
  ]) {
    const h = harness('basic');
    assert.equal(preferences.isWellhubPlanPreferenceMessage(phrase), false, phrase);
    const reply = await h.send(phrase);
    assert.doesNotMatch(reply, /Plano Wellhub atualizado/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'basic', phrase);
    assert.equal(h.writes.length, 0, phrase);
  }
});

test('a plan update is not confirmed when no profile or saved snapshot is available', async () => {
  const phrase = 'Gostaria de alterar meu plano Wellhub para Silver+';
  for (const mode of ['no-profile', 'null-snapshot', 'old-snapshot']) {
    const h = harness();
    if (mode === 'null-snapshot') h.context.conciergeSaveSnapshotAsync = async () => null;
    if (mode === 'old-snapshot') h.context.conciergeSaveSnapshotAsync = async () => ({ preferences: { wellhubPlan: 'basic' } });
    const reply = await h.context.conciergeGymsReply(await h.load(), phrase, mode === 'no-profile' ? {} : h.profile);
    assert.match(reply, /Não consegui confirmar que seu plano Wellhub ficou salvo no CrewCheck/);
    assert.doesNotMatch(reply, /atualizado|✓/);
    assert.equal((await h.load()).preferences.wellhubPlan, 'basic');
    assert.equal(h.searches.length, 0);
  }
});


test('real save functions cannot acknowledge success when storage fails or local and durable tiers disagree', async () => {
  const phrase = 'Gostaria de alterar meu plano Wellhub para Silver+';
  for (const io of [
    { localWrite: false, dbWrite: false },
    { localWrite: true, dbWrite: false },
    { localWrite: false, dbWrite: true },
    { localWrite: 'throw' },
    { dbWrite: 'throw' },
    { dbRead: false },
    { dbRead: 'throw' },
  ]) {
    const h = harness('basic', 'wellhub', io);
    const reply = await h.send(phrase);
    assert.match(reply, /Não consegui confirmar que seu plano Wellhub ficou salvo no CrewCheck/, JSON.stringify(io));
    assert.doesNotMatch(reply, /atualizado|✓|Wellhub verificado/);
    assert.equal(h.searches.length, 0);
    if (io.dbWrite === false) {
      h.restart();
      assert.equal((await h.load()).preferences.wellhubPlan, 'basic', 'a stale durable Basic must never be reported as saved Silver+');
    }
  }
});


test('read-back evidence must belong to the same trusted profile key', async () => {
  const h = harness();
  h.context.conciergeDbGet = async () => ({ key: h.other.email, preferences: { wellhubPlan: 'silver-plus' } });
  const reply = await h.send('Gostaria de alterar meu plano Wellhub para Silver+');
  assert.match(reply, /Não consegui confirmar que seu plano Wellhub ficou salvo no CrewCheck/);
  assert.doesNotMatch(reply, /atualizado|✓/);
});
