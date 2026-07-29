import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeConciergeNaturalTextV14341,
  parseConciergeNaturalDateV14341,
  interpretConciergeNaturalTextV14341,
  buildConciergeContextV14341,
  isConciergeContextFreshV14341,
  CONCIERGE_SEMANTIC_POLICY_V14341,
} from '../server/v14341/concierge-semantic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixedNow = new Date('2026-07-27T15:00:00-03:00');

assert.equal(normalizeConciergeNaturalTextV14341('E o PORTÃO?'), 'e o portao', 'normalização deve aceitar acentos, caixa e pontuação');
assert.equal(parseConciergeNaturalDateV14341('o que tenho amanhã?', fixedNow), '2026-07-28', 'amanhã deve usar Brasília');
assert.equal(parseConciergeNaturalDateV14341('o que tenho depois de amanhã?', fixedNow), '2026-07-29', 'depois de amanhã deve ser entendido');
assert.equal(parseConciergeNaturalDateV14341('o que tenho na próxima sexta?', fixedNow), '2026-07-31', 'dia da semana deve localizar a próxima ocorrência');
assert.equal(parseConciergeNaturalDateV14341('o que tenho dia 25?', fixedNow), '2026-08-25', 'dia já passado deve avançar para o mês seguinte');
assert.equal(parseConciergeNaturalDateV14341('escala 15/08', fixedNow), '2026-08-15', 'data numérica deve ser reconhecida');

const previous = {
  lastIntent: 'radar', flight: 'LA3730', origin: 'BSB', destination: 'GRU', airport: 'GRU',
  recordKey: '2026-07-31:LA3730:12:00', dateKey: '2026-07-31', updatedAt: fixedNow.toISOString(), turns: 1,
};
const gate = interpretConciergeNaturalTextV14341('e o portão?', previous, new Date(fixedNow.getTime() + 10 * 60_000));
assert.equal(gate.intent, 'radar', 'continuação curta deve manter intenção de radar');
assert.equal(gate.flight, 'LA3730', 'continuação deve recuperar o voo anterior');
assert.match(gate.rewrite, /\/radar LA3730/, 'continuação deve ser roteada para o radar existente');

const golGate = interpretConciergeNaturalTextV14341('qual o portão do G3 1234?', null, fixedNow);
assert.equal(golGate.intent, 'radar');
assert.equal(golGate.flight, 'G31234', 'consulta natural deve preservar o designador G3');
assert.match(golGate.rewrite, /\/radar G31234/);
const azulStatus = interpretConciergeNaturalTextV14341('status do voo AD 4040', null, fixedNow);
assert.equal(azulStatus.flight, 'AD4040', 'consulta natural deve preservar o designador AD');
assert.match(azulStatus.rewrite, /\/radar AD4040/);
const azulIcaoStatus = interpretConciergeNaturalTextV14341('o AZU 4001 atrasou?', null, fixedNow);
assert.equal(azulIcaoStatus.flight, 'AZU4001', 'designador ICAO AZU deve ser preservado');

const after = interpretConciergeNaturalTextV14341('e depois desse voo?', previous, new Date(fixedNow.getTime() + 20 * 60_000));
assert.equal(after.intent, 'next_after_context', 'referência “depois desse voo” deve usar contexto');
const presentation = interpretConciergeNaturalTextV14341('que horas me apresento?', previous, fixedNow);
assert.equal(presentation.intent, 'presentation', 'apresentação natural deve ter intenção própria');
const returnBase = interpretConciergeNaturalTextV14341('quando volto para a base?', previous, fixedNow);
assert.equal(returnBase.intent, 'return_base', 'retorno à base deve ser compreendido sem comando');
const pharmacy = interpretConciergeNaturalTextV14341('tem farmácia perto de mim?', previous, fixedNow);
assert.equal(pharmacy.intent, 'pharmacy', 'farmácia deve reaproveitar a busca existente');
assert.equal(pharmacy.rewrite, '/farmacias');
const dateQuery = interpretConciergeNaturalTextV14341('o que tenho dia 31?', previous, fixedNow);
assert.equal(dateQuery.intent, 'schedule_date');
assert.equal(dateQuery.dateKey, '2026-07-31');
const uppercaseWeather = interpretConciergeNaturalTextV14341('QUAL O TEMPO NO AEROPORTO?', previous, fixedNow);
assert.equal(uppercaseWeather.intent, 'weather');
assert.notEqual(uppercaseWeather.airport, 'QUAL', 'palavra comum em caixa alta nunca pode virar aeroporto');
const requestedWeather = interpretConciergeNaturalTextV14341('como está o METAR em SBGR?', null, fixedNow);
assert.equal(requestedWeather.intent, 'weather');
assert.equal(requestedWeather.airport, 'SBGR', 'scanner deve continuar até o ICAO solicitado');
assert.match(requestedWeather.rewrite, /\/metar SBGR decodificado/);
const lowercaseWeather = interpretConciergeNaturalTextV14341('metar sbbr', null, fixedNow);
assert.equal(lowercaseWeather.airport, 'SBBR', 'ICAO brasileiro em minúsculas deve ser aceito');

const expired = { ...previous, updatedAt: new Date(fixedNow.getTime() - 7 * 60 * 60_000).toISOString() };
assert.equal(isConciergeContextFreshV14341(expired, fixedNow), false, 'contexto deve expirar após seis horas');
const expiredFollowUp = interpretConciergeNaturalTextV14341('e o portão?', expired, fixedNow);
assert.equal(expiredFollowUp.flight, '', 'contexto expirado não pode recuperar voo antigo');

const context = buildConciergeContextV14341(gate, previous, fixedNow, { origin: 'BSB', destination: 'GRU', recordKey: 'safe-record' });
assert.equal(context.version, '14.3.41');
assert.equal(context.flight, 'LA3730');
assert.equal(context.recordKey, 'safe-record');
assert.equal(context.turns, 2);
assert.ok(Date.parse(context.expiresAt) - fixedNow.getTime() === 6 * 60 * 60_000, 'expiração deve ser exatamente seis horas');
for (const forbidden of ['originalText','normalized','message','transcript','rawText']) assert.ok(!(forbidden in context), `contexto não pode armazenar ${forbidden}`);
assert.deepEqual(CONCIERGE_SEMANTIC_POLICY_V14341, {
  contextTtlHours: 6,
  storesRawConversation: false,
  sourceOfTruth: 'active-canonical-roster',
  externalGenerativeModelRequired: false,
});

const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const serverPath = path.join(root, 'server.mjs');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const releasePath = path.join(root, 'client/public/release.json');
const serverBefore = fs.readFileSync(serverPath, 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
const releaseBefore = fs.readFileSync(releasePath, 'utf8');
const engineSource = fs.readFileSync(path.join(root, 'server/v14338/concierge-semantic.mjs'), 'utf8');
const applySource = fs.readFileSync(path.join(root, 'scripts/v14341/apply.mjs'), 'utf8');

assert.ok(chain.includes("await import('../v14341/apply.mjs');"), 'v14.3.41 deve integrar o interpretador semântico');
assert.ok(chain.includes("await import('../v14341/compatibility.mjs');"), 'v14.3.41 deve encerrar descartando contexto expirado');
for (const marker of [
  "from './server/v14341/concierge-semantic.mjs'",
  'async function buildTelegramConciergeReplyCore(',
  'function conciergeSemanticScheduleDateReplyV14338(',
  'function conciergeSemanticPresentationReplyV14338(',
  'function conciergeSemanticReturnBaseReplyV14338(',
  'function conciergeSemanticNextAfterReplyV14338(',
  'conciergeConversation: conversation',
  'semanticConversation: true',
  'semanticContextTtlHours: 6',
  "if (!isConciergeContextFreshV14338(previous)) return null;",
]) assert.ok(serverBefore.includes(marker), `servidor preparado sem marcador: ${marker}`);
assert.ok(!serverBefore.includes("if (!isConciergeContextFreshV14338(previous)) return previous;"), 'contexto vencido não pode alcançar busca por recordKey, voo ou data');
for (const marker of [
  "const DEFAULT_VERSION = '14.3.47';",
  'data-concierge-semantic="v14.3.41"',
  'Converse normalmente',
  'O contexto expira em até 6 horas',
  'title="Compreensão" value="Natural"',
  '<h2>Teste a conversa</h2>',
]) assert.ok(homeBefore.includes(marker), `interface preparada sem marcador: ${marker}`);
assert.ok(releaseBefore.includes('14.3.47'), 'release Web/PWA final deve ser 14.3.47');
assert.ok(!engineSource.includes('fetch('), 'interpretador semântico deve ser determinístico e sem chamada externa');
assert.ok(!/OPENAI|GEMINI|ANTHROPIC|LLM_API/i.test(engineSource), 'interpretador não pode depender de modelo generativo externo');
for (const protectedPath of ['client/src/lib/pdfParser.ts','server/rosterParser.mjs','canonicalRoster','financialRules']) {
  assert.ok(!applySource.includes(`update('${protectedPath}`), `v14.3.41 não pode alterar motor protegido: ${protectedPath}`);
}

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14347/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.47 falhou');
assert.equal(fs.readFileSync(serverPath, 'utf8'), serverBefore, 'preparação final deve preservar o Concierge semântico no servidor');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'preparação final deve preservar o Concierge semântico na interface');
assert.equal(fs.readFileSync(releasePath, 'utf8'), releaseBefore, 'preparação final deve preservar o release');

console.log('v14.3.41 Concierge semantic context: natural dates, carriers, requested ICAO, follow-ups, expired-context isolation, safe memory, canonical routing, UI and idempotency validated.');
