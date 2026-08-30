import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { detectWellhubPlanFromText } from '../server/v14407/wellhub.mjs';
import { normalizeConciergeLocation } from '../server/v14335/concierge-location.mjs';
import {
  extractWellhubLocationHintFromText,
  filterWellhubPartnersForLocation,
  isWellhubActivityPreferenceMessage,
  isWellhubPlanPreferenceMessage,
} from '../server/v14410/wellhub-concierge.mjs';

assert.equal(detectWellhubPlanFromText('meu plano Wellhub é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('meu plano é Silver+'), 'silver-plus');
assert.equal(detectWellhubPlanFromText('Silver Plus'), 'silver-plus');
assert.equal(isWellhubPlanPreferenceMessage('meu plano é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('meu plano Wellhub é Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('Wellhub: Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('Silver+'), true);
assert.equal(isWellhubPlanPreferenceMessage('uso Gold'), true);
assert.equal(isWellhubPlanPreferenceMessage('tenho Basic+'), true);
assert.equal(isWellhubPlanPreferenceMessage('o avião é silver'), false);
assert.equal(isWellhubPlanPreferenceMessage('meu plano de saúde é Silver'), false);
assert.equal(isWellhubPlanPreferenceMessage('meu plano de celular é Gold'), false);
assert.equal(isWellhubPlanPreferenceMessage('meu plano Silver da Vivo'), false);
assert.equal(detectWellhubPlanFromText("academia Gold's Gym perto de mim"), 'gold');
assert.equal(isWellhubPlanPreferenceMessage("academia Gold's Gym perto de mim"), false);
assert.equal(isWellhubPlanPreferenceMessage("A Gold's Gym aceita Wellhub?"), false);

assert.equal(isWellhubActivityPreferenceMessage('quero Pilates'), true);
assert.equal(isWellhubActivityPreferenceMessage('modalidade Pilates'), true);
assert.equal(isWellhubActivityPreferenceMessage('Wellhub quero Pilates'), true);
assert.equal(isWellhubActivityPreferenceMessage('academia Smart Fit com Pilates'), false);
assert.equal(isWellhubActivityPreferenceMessage('quero corrida para o aeroporto'), false);
assert.equal(isWellhubActivityPreferenceMessage('meu voo atrasou depois do Pilates'), false);

assert.deepEqual(extractWellhubLocationHintFromText('academia em Canoas perto de mim'), { city: 'Canoas', state: '' });
assert.deepEqual(extractWellhubLocationHintFromText('academia na cidade de São Paulo/SP'), { city: 'São Paulo', state: 'SP' });
assert.deepEqual(extractWellhubLocationHintFromText('meu plano é Silver+'), { city: '', state: '' });

const sample = [
  { name: 'Local FLN', city: 'Florianópolis', state: 'SC' },
  { name: 'Outra SC', city: 'Chapecó', state: 'SC' },
  { name: 'São Paulo', city: 'São Paulo', state: 'SP' },
];
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianopolis', state: 'SC' }).map((item) => item.name), ['Local FLN']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianópolis' }).map((item) => item.name), ['Local FLN']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { state: 'SC' }).map((item) => item.name), ['Local FLN', 'Outra SC']);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'Florianópolis' }).filter((item) => item.state === 'SP'), []);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'São Paulo', state: 'RJ' }).map((item) => item.name), []);
assert.deepEqual(filterWellhubPartnersForLocation(sample, { city: 'São Paulo', state: 'SP' }).map((item) => item.name), ['São Paulo']);
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
assert.ok(apply.includes('replaceAllGymDispatchers'), 'materializador precisa colapsar dispatchers antigos');
assert.ok(apply.includes('isWellhubPlanPreferenceMessage(value)'), 'roteamento precisa reconhecer atualização natural do plano');
assert.ok(apply.includes('isWellhubActivityPreferenceMessage(value)'), 'roteamento precisa reconhecer modalidade natural');
assert.ok(snippet.includes("const planUpdate = planPreference ? detectedPlan : '';"), 'tier detectado só pode virar preferência com intenção Wellhub');
assert.ok(snippet.includes("const activityUpdate = activityPreference ? detectedActivity : '';"), 'modalidade só deve persistir com intenção explícita');
assert.ok(snippet.includes('const provider = planPreference || activityPreference'), 'preferência explícita de modalidade deve selecionar Wellhub');
assert.ok(!snippet.includes('detectedPlan && wellhubContext'), 'nome de academia com Gold/Silver não pode alterar o tier');
assert.ok(snippet.includes('extractWellhubLocationHintFromText(text)'), 'cidade informada na mensagem precisa destravar reverse geocode incompleto');
assert.ok(snippet.includes('Não tenho uma cidade/UF confirmada para pesquisar academias com segurança.'), 'busca sem geografia deve falhar fechado');
assert.ok(snippet.includes('filterWellhubPartnersForLocation(candidatePartners'), 'Concierge precisa filtrar geograficamente antes de responder');
assert.ok(snippet.includes('Não vou usar o aeroporto da escala como substituto'), 'GPS recente sem cidade deve falhar fechado');
assert.ok(snippet.includes('“academia em Canoas”'), 'mensagem de recuperação deve anunciar um caminho implementado');
assert.ok(snippet.includes('Não vou sugerir unidade de outra cidade/estado'), 'falha geográfica deve ser explícita e fail-closed');
assert.ok(snippet.includes('Plano Wellhub atualizado para'), 'mudança de plano deve ser confirmada ao usuário');
assert.ok(snippet.includes('Modalidade Wellhub atualizada para'), 'mudança de modalidade deve ser confirmada ao usuário');
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
assert.equal((materializedServer.match(/return conciergeGymsReply\(snapshot, value, profile\);/g) || []).length, 1, 'deve existir um único dispatcher de academias');
assert.ok(!materializedServer.includes('return conciergeGymsReply(snapshot);'), 'atalho legado não pode sombrear texto/perfil');
assert.ok(!materializedServer.includes('detectedPlan && wellhubContext'), 'materializado não pode persistir tier por mero nome de academia');
assert.match(materializedServer, /isWellhubActivityPreferenceMessage\(value\)/);
assert.match(materializedServer, /const provider = planPreference \|\| activityPreference/);
assert.match(materializedServer, /extractWellhubLocationHintFromText\(text\)/);
assert.match(materializedServer, /Não tenho uma cidade\/UF confirmada para pesquisar academias com segurança\./);
assert.match(materializedServer, /configureWhatsAppConcierge\(async \(\{ email, text, location \}\)/);
assert.match(materializedServer, /source: 'whatsapp'/);
assert.match(materializedWhatsApp, /message\?\.type === 'location'/);
assert.match(materializedWhatsApp, /location: message\.location \|\| null/);
assert.match(materializedWhatsApp, /conciergeLocation: true/);

console.log('CrewCheck v14.4.10 Wellhub plan/activity + geo fail-closed + WhatsApp location parity: PASS');
