import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  detectWellhubActivityFromText,
  detectWellhubPlanFromText,
  loadVerifiedWellhubPartners,
  openingIntervalsForWeekday,
  searchVerifiedWellhub,
  wellhubPlanAllows,
} from '../server/v14407/wellhub.mjs';

const apply = fs.readFileSync('scripts/v14407/apply.mjs', 'utf8');
const helper = fs.readFileSync('server/v14407/wellhub.mjs', 'utf8');
const client = fs.readFileSync('client/src/lib/wellhubLive.ts', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const partners = loadVerifiedWellhubPartners();
assert.ok(partners.length >= 19, 'catálogo verificado não pode encolher silenciosamente');
assert.ok(partners.every((item) => item.source === 'wellhub-public-directory'), 'toda unidade deve ter fonte Wellhub');
assert.ok(partners.every((item) => /^https:\/\/wellhub\.com\/pt-br\/search\/partners\//.test(item.sourceUrl)), 'cada unidade precisa de página oficial individual');
assert.ok(!helper.includes('google.com/maps'), 'motor Wellhub não pode usar Google Maps para elegibilidade/modalidade');

assert.equal(detectWellhubPlanFromText('meu plano Wellhub é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('uso Basic Plus'), 'basic-plus');
assert.equal(detectWellhubActivityFromText('quero academia com musculação'), 'Treino de força');
assert.equal(detectWellhubActivityFromText('modalidade: Pilates perto do hotel'), 'Pilates');
assert.equal(detectWellhubActivityFromText('tem HIIT?'), 'HIIT');
assert.equal(wellhubPlanAllows('silver', 'basic-plus'), true);
assert.equal(wellhubPlanAllows('basic', 'basic-plus'), false);

const basic = await searchVerifiedWellhub({ plan: 'basic', locationText: 'Guarulhos SP', live: false, limit: 30 });
assert.ok(basic.some((item) => item.name.includes('Panobianco')), 'plano Basic deve encontrar unidade Basic verificada');
assert.ok(!basic.some((item) => item.minimumPlan === 'basic-plus'), 'plano Basic não pode receber unidade Basic+');

const gavioes = partners.find((item) => item.id === 'gavioes-vila-augusta-guarulhos');
assert.ok(gavioes, 'fixture Gaviões Vila Augusta ausente');
assert.deepEqual(openingIntervalsForWeekday(gavioes, 2), [[0, 1440]], 'unidade 24h deve produzir janela integral');
const pano = partners.find((item) => item.id === 'panobianco-guarulhos-macedo');
assert.ok(pano, 'fixture Panobianco Guarulhos ausente');
assert.deepEqual(openingIntervalsForWeekday(pano, 1), [[300, 1380]], 'horário oficial de segunda deve ser interpretado');

for (const token of [
  'fetchWellhubVerifiedSearch',
  'crewcheck:wellhub-activity',
  'Modalidade desejada',
  'fetchWellhubRoutineSuggestion',
  'WellhubRoutineCard',
  'gymActivity:',
  'cc-v14407:concierge-gyms',
  'detectWellhubPlanFromText',
  'detectWellhubActivityFromText',
  'buildWellhubRoutineSuggestion',
  "'/api/wellhub/search'",
  "'/api/wellhub/routine'",
]) assert.ok(apply.includes(token), `apply v14.4.07 perdeu contrato: ${token}`);

assert.ok(client.includes('/api/wellhub/search'), 'cliente precisa consumir busca verificada interna');
assert.ok(client.includes('/api/wellhub/routine'), 'cliente precisa consumir rotina baseada nos horários');
assert.ok(loader.includes("../v14407/apply.mjs"), 'preparação canônica precisa aplicar v14.4.07');
assert.ok(loader.includes("../v14407/compatibility.mjs"), 'preparação canônica precisa manter idempotência v14.4.06');

console.log('CrewCheck v14.4.07 Wellhub Concierge + modalidade + rotina: PASS');
