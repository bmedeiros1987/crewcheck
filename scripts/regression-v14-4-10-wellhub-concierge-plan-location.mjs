import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { detectWellhubPlanFromText } from '../server/v14407/wellhub.mjs';
import { normalizeConciergeLocation } from '../server/v14335/concierge-location.mjs';
import { filterWellhubPartnersForLocation, isWellhubPlanPreferenceMessage } from '../server/v14410/wellhub-concierge.mjs';

assert.equal(detectWellhubPlanFromText('meu plano Wellhub é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('meu plano é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('Silver Plus'), 'silver-plus');
assert.equal(isWellhubPlanPreferenceMessage('meu plano é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('meu plano Wellhub é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('uso Gold'), true);
assert.equal(isWellhubPlanPreferenceMessage('tenho Basic+'), true);
assert.equal(isWellhubPlanPreferenceMessage('o avião é silver'), false);
assert.equal(isWellhubPlanPreferenceMessage('meu plano de saúde é Silver'), false);
assert.equal(isWellhubPlanPreferenceMessage('meu plano de celular é Gold'), false);

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

const now = new Date('2026-08-30T13:22:00.000Z');
const whatsappLocation = normalizeConciergeLocation({
  latitude: -29.92,
  longitude: -51.18,
  source: 'whatsapp',
  city: 'Canoas',
  state: 'RS',
  updatedAt: now.toISOString(),
}, {
  now,
  airportPoints: { POA: { lat: -29.9944, lon: -51.1714, city: 'Porto Alegre' } },
});
assert.equal(whatsappLocation?.source, 'whatsapp');
assert.equal(whatsappLocation?.city, 'Canoas');
assert.equal(whatsappLocation?.state, 'RS');

const apply = fs.readFileSync('scripts/v14410/apply.mjs', 'utf8');
const snippet = fs.readFileSync('scripts/v14410/concierge-gyms.snippet', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
assert.ok(apply.includes('isWellhubPlanPreferenceMessage(value)'), 'roteamento precisa reconhecer atualização natural do plano');
assert.ok(snippet.includes("planPreference || (detectedPlan && wellhubContext)"), 'tier Wellhub precisa tirar o usuário do branch Smart Fit');
assert.ok(snippet.includes('filterWellhubPartnersForLocation(candidatePartners'), 'Concierge precisa filtrar geograficamente antes de responder');
assert.ok(snippet.includes('Não vou usar o aeroporto da escala como substituto'), 'GPS recente sem cidade deve falhar fechado');
assert.ok(snippet.includes('Não vou sugerir unidade de outra cidade/estado'), 'falha geográfica deve ser explícita e fail-closed');
assert.ok(snippet.includes('Plano Wellhub atualizado para'), 'mudança de plano deve ser confirmada ao usuário');
assert.ok(snippet.includes('Acesso: ✓ incluído no seu ${userPlanLabel} · mínimo da unidade: ${minimumPlanLabel}'), 'resultado deve separar plano do usuário do plano mínimo da unidade');
assert.ok(loader.includes("../v14410/apply.mjs"), 'preparação canônica precisa aplicar v14.4.10');
assert.ok(!loader.includes("../v14409/apply.mjs"), 'slice Wellhub não pode disputar o namespace v14.4.09');

const hashFiles = () => crypto.createHash('sha256')
  .update(fs.readFileSync('server.mjs'))
  .update(fs.readFileSync('server/whatsapp.mjs'))
  .digest('hex');
execFileSync(process.execPath, ['scripts/v14410/apply.mjs'], { stdio: 'pipe' });
const firstHash = hashFiles();
execFileSync(process.execPath, ['scripts/v14410/apply.mjs'], { stdio: 'pipe' });
const secondHash = hashFiles();
assert.equal(secondHash, firstHash, 'v14.4.10 precisa ser idempotente em server.mjs e WhatsApp');

const materializedServer = fs.readFileSync('server.mjs', 'utf8');
const materializedWhatsApp = fs.readFileSync('server/whatsapp.mjs', 'utf8');
assert.equal((materializedServer.match(/cc-v14410:concierge-gyms-plan-location/g) || []).length, 1, 'marcador Wellhub não pode duplicar');
assert.equal((materializedServer.match(/cc-v14409:concierge-gyms-plan-location/g) || []).length, 0, 'marcador legado v14.4.09 não pode permanecer');
assert.ok(!materializedServer.includes('return conciergeGymsReply(snapshot);'), 'atalho legado não pode sombrear texto/perfil');
assert.match(materializedServer, /configureWhatsAppConcierge\(async \(\{ email, text, location \}\)/);
assert.match(materializedServer, /source: 'whatsapp'/);
assert.match(materializedWhatsApp, /message\?\.type === 'location'/);
assert.match(materializedWhatsApp, /location: message\.location \|\| null/);
assert.match(materializedWhatsApp, /conciergeLocation: true/);

console.log('CrewCheck v14.4.10 Wellhub plan + geo fail-closed + WhatsApp location parity: PASS');
