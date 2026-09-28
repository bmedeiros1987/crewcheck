import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preflightPath = path.join(root, 'scripts/v14323-preflight/apply.mjs');
const legacyApplyPath = path.join(root, 'scripts/v14323/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14323-preflight/apply.mjs');"), 'preflight deve executar antes do patch legado');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14323-preflight-'));
const serverPath = path.join(tempDir, 'server.mjs');
const fixture = `function conciergeTime(value) { return value; }
function conciergeProgramDate() { return new Date(); }
const WEATHER_AIRPORT_POINTS = {};
function conciergePresentationTime() { return '10:00'; }
function conciergeHelp() { return 'ajuda'; }
function conciergeNextProgram(roster = {}, now = new Date()) {
  return null;
}
async function conciergeSearchPlaces(query, locationText = '', location = null, maxResultCount = 4) {
  const payload = { places: [] };
  const headers = { 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.googleMapsUri,places.currentOpeningHours.openNow' };
  void headers;
  return (payload?.places || []).slice(0, maxResultCount).map((place) => ({ name: place.displayName?.text || 'Local', address: place.formattedAddress || '', rating: place.rating || 0, mapsUrl: place.googleMapsUri || '', openNow: place.currentOpeningHours?.openNow }));
}
function conciergePlaceLines(places = []) {
  return places.map((place, index) => {
    const distance = Number.isFinite(place.distanceKm) ? 'distância' : '';
    return \`${'${index + 1}'}. ${'${place.name}'}${'${distance}'}\`;
  }).join('\\n\\n');
}
function conciergeRoutineReply(snapshot) {
  const next = conciergeNextProgram(snapshot?.roster);
  if (!next) return 'Envie ou sincronize sua escala para eu montar a rotina de recuperação, treino, alimentação e sono.';
  const items = [];
  return ['Rotina sugerida', ...items.map((item) => \`• ${'${item}'}\`)].join('\\n');
}
function conciergeRegulationReply() {
  return 'preservada';
}
async function buildTelegramConciergeReply(value, lower, snapshot, profile = {}) {
  if (/^\\/(?:hoteis|hotéis|hotel)(?:@\\S+)?\\b/i.test(value) || /\\b(hotel|hot[eé]is|pernoite|onde vou dormir|onde fico hoje)\\b/i.test(lower)) return conciergeHotelsReply(snapshot);
  if (/^\\/academias?(?:@\\S+)?\\b/i.test(value) || /\\b(academia|wellhub|gympass|smart fit|treino perto|onde treinar)\\b/i.test(lower)) return conciergeGymsReply(snapshot);
  if (/^\\/rotina(?:@\\S+)?\\b/i.test(value) || /\\b(rotina|recupera[cç][aã]o|treino hoje|como organizar meu dia)\\b/i.test(lower)) return conciergeRoutineReply(snapshot);
  return 'Não entendi exatamente o que você quer consultar. Você pode perguntar, por exemplo: “o que tenho para hoje?”, “qual é meu próximo voo?”, “que horas devo sair de casa?” ou “qual é o portão do meu voo?”.';
}
`;

const expectedPlaceLines = [
  'function conciergePlaceLines(places = []) {',
  '  return places.map((place, index) => {',
  "    const distance = Number.isFinite(place.distanceKm) ? ` · ${place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1).replace(`.`, `,`)} km`}` : '';",
  "    return `${index + 1}. ${place.name}${distance}${place.rating ? ` · nota ${place.rating}` : ``}${place.openNow === true ? ` · aberto agora` : place.openNow === false ? ` · fechado agora` : ``}\\n${place.address || place.mapsUrl || ``}`;",
  "  }).join('\\n\\n');",
  '}',
].join('\n');

const expectedHotelDispatch = String.raw`  if (/^\/(?:hoteis|hotéis|hotel)(?:@\S+)?\b/i.test(value) || /\b(hotel|hot[eé]is|pernoite)\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
const expectedGymDispatch = String.raw`  if (/^\/academias?(?:@\S+)?\b/i.test(value) || /\b(academia|wellhub|gympass|smart fit|treino perto)\b/i.test(lower)) return conciergeGymsReply(snapshot);`;
const expectedRoutineDispatch = String.raw`  if (/^\/rotina(?:@\S+)?\b/i.test(value) || /\b(rotina|recupera[cç][aã]o|treino hoje)\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;
const expectedHotelGuard = String.raw`  if (/\b(onde vou dormir|onde fico hoje)\b/i.test(lower)) return conciergeHotelsReply(snapshot);`;
const expectedGymGuard = String.raw`  if (/\bonde treinar\b/i.test(lower)) return conciergeGymsReply(snapshot);`;
const expectedRoutineGuard = String.raw`  if (/\bcomo organizar meu dia\b/i.test(lower)) return conciergeRoutineReply(snapshot);`;
const expectedFallback = "  return `Entendi sua mensagem, mas preciso de um comando operacional mais específico.\\n\\n${conciergeHelp(profile.name)}`;";

try {
  fs.writeFileSync(serverPath, fixture, 'utf8');

  const firstPreflight = spawnSync(process.execPath, [preflightPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(firstPreflight.status, 0, firstPreflight.stderr || firstPreflight.stdout || 'preflight falhou');

  const prepared = fs.readFileSync(serverPath, 'utf8');
  assert.ok(prepared.includes(expectedPlaceLines), 'bloco normalizado deve coincidir com o formato esperado pelo patch v14.3.23');
  assert.ok(prepared.includes('function conciergeRoutineReply(snapshot) {'), 'rotina não pode ser removida');
  assert.ok(prepared.includes('function conciergeRegulationReply() {'), 'funções seguintes não podem ser removidas');
  assert.ok(prepared.includes(expectedHotelDispatch), 'intenção de pernoite deve coincidir com o anchor legado');
  assert.ok(prepared.includes(expectedGymDispatch), 'intenção de hospitais deve partir do anchor de academias esperado');
  assert.ok(prepared.includes(expectedRoutineDispatch), 'perguntas naturais de rotina devem partir do anchor esperado');
  assert.ok(prepared.includes(expectedHotelGuard), 'onde fico hoje deve permanecer suportado');
  assert.ok(prepared.includes(expectedGymGuard), 'onde treinar deve permanecer suportado');
  assert.ok(prepared.includes(expectedRoutineGuard), 'como organizar meu dia deve permanecer suportado');
  assert.ok(prepared.includes(expectedFallback), 'fallback deve coincidir com o anchor legado');
  assert.ok(!prepared.includes(".join('\n\n');"), 'o código gerado não pode conter quebras reais dentro da string de join');

  const preparedSyntax = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
  assert.equal(preparedSyntax.status, 0, preparedSyntax.stderr || preparedSyntax.stdout || 'server.mjs preparado é sintaticamente inválido');

  const legacy = spawnSync(process.execPath, [legacyApplyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(legacy.status, 0, legacy.stderr || legacy.stdout || 'v14.3.23 ainda falhou após o preflight');

  const fullyPatched = fs.readFileSync(serverPath, 'utf8');
  assert.ok(fullyPatched.includes('function conciergeStayRecords('), 'contexto de pernoite deve ser aplicado');
  assert.ok(fullyPatched.includes('async function conciergeHospitalsReply('), 'hospitais devem ser aplicados');
  assert.ok(fullyPatched.includes('function conciergeContextualRoutineReply('), 'rotina contextual deve ser aplicada');
  assert.ok(fullyPatched.includes('Posso conversar sobre sua escala de forma mais natural.'), 'fallback contextual deve ser aplicado');
  assert.ok(fullyPatched.includes('onde fico hoje'), 'intenção adicional de hotel deve sobreviver ao patch legado');
  assert.ok(fullyPatched.includes('onde treinar'), 'intenção adicional de academia deve sobreviver ao patch legado');
  assert.ok(fullyPatched.includes('como organizar meu dia'), 'intenção adicional de rotina deve sobreviver ao patch legado');

  const finalSyntax = spawnSync(process.execPath, ['--check', serverPath], { encoding: 'utf8' });
  assert.equal(finalSyntax.status, 0, finalSyntax.stderr || finalSyntax.stdout || 'server.mjs final é sintaticamente inválido');

  const secondPreflight = spawnSync(process.execPath, [preflightPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(secondPreflight.status, 0, secondPreflight.stderr || secondPreflight.stdout || 'segunda execução do preflight falhou');
  const secondLegacy = spawnSync(process.execPath, [legacyApplyPath], { cwd: tempDir, encoding: 'utf8' });
  assert.equal(secondLegacy.status, 0, secondLegacy.stderr || secondLegacy.stdout || 'segunda execução do v14.3.23 falhou');
  assert.equal(fs.readFileSync(serverPath, 'utf8'), fullyPatched, 'preflight e patch legado devem ser idempotentes em conjunto');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.23 full-chain dispatch, fallback and escaped-newline regression: OK');
