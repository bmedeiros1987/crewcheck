import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectWellhubPlanFromText } from '../server/v14407/wellhub.mjs';
import { filterWellhubPartnersForLocation, isWellhubPlanPreferenceMessage } from '../server/v14409/wellhub-concierge.mjs';

assert.equal(detectWellhubPlanFromText('meu plano Wellhub é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('meu plano é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('Silver Plus'), 'silver-plus');
assert.equal(isWellhubPlanPreferenceMessage('meu plano é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('meu plano Wellhub é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('o avião é silver'), false);

const sample = [
  { name: 'Local FLN', city: 'Florianópolis', state: 'SC' },
  { name: 'Outra SC', city: 'Chapecó', state: 'SC' },
  { name: 'São Paulo', city: 'São Paulo', state: 'SP' },
];
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianopolis', state: 'SC' }).map((item) => item.name), ['Local FLN']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianópolis' }).map((item) => item.name), ['Local FLN']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { state: 'SC' }).map((item) => item.name), ['Local FLN', 'Outra SC']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianópolis' }).filter((item) => item.state === 'SP'), []);
assert.deepEqual(filterWellhubPartnersForLocation(sample, {}).map((item) => item.name), ['Local FLN', 'Outra SC', 'São Paulo']);

const apply = fs.readFileSync('scripts/v14409/apply.mjs', 'utf8');
const snippet = fs.readFileSync('scripts/v14409/concierge-gyms.snippet', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
assert.ok(apply.includes('isWellhubPlanPreferenceMessage(value)'), 'roteamento precisa reconhecer atualização natural do plano');
assert.ok(snippet.includes('filterWellhubPartnersForLocation(candidatePartners'), 'Concierge precisa filtrar geograficamente antes de responder');
assert.ok(snippet.includes('Não vou sugerir unidade de outra cidade/estado'), 'falha geográfica deve ser explícita e fail-closed');
assert.ok(snippet.includes('Plano Wellhub atualizado para'), 'mudança de plano deve ser confirmada ao usuário');
assert.ok(loader.includes("../v14409/apply.mjs"), 'preparação canônica precisa aplicar v14.4.09');

console.log('CrewCheck v14.4.09 Wellhub Concierge plan + geo fail-closed: PASS');
