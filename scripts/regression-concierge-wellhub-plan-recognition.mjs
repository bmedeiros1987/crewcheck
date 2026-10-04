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
function harness(initialPlan = 'basic') {
  const profile = { email: 'wellhub-a@example.invalid', name: 'Synthetic A' };
  const other = { email: 'wellhub-b@example.invalid', name: 'Synthetic B' };
  const initial = p => ({ key: p.email, email: p.email, roster: { base: 'GRU', days: [] }, preferences: { gymPlan: 'wellhub', wellhubPlan: initialPlan, unrelated: 'keep' } });
  let local = { snapshots: { [profile.email]: initial(profile), [other.email]: initial(other) } };
  const database = new Map();
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
    telegramRostersWrite: data => { local = clone(data); return true; },
    conciergeDbPut: async (key, value) => { writes.push({ key, value: clone(value) }); database.set(key, clone(value)); return true; },
    conciergeDbGet: async key => database.has(key) ? clone(database.get(key)) : null,
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
  assert.equal(reply, 'Plano Wellhub atualizado para Silver+ ✓');
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
  const oldImport = apply.match(/const previousConciergeImport = "([^"\n]+)";/)?.[1];
  assert.ok(wellhubImport && oldImport);
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
    for (const previous of ['', `${oldImport}\n`]) {
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
