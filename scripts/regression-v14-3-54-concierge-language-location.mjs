import fs from 'node:fs';
import {
  CONCIERGE_OFFICIAL_ROSTER_NOTICE_V14354,
  conciergeFinalizeReplyV14354,
  conciergeFormatTextV14354,
  parseConciergePtNumberV14354,
} from '../server/v14354/concierge-language.mjs';
import {
  conciergeLocationState,
} from '../server/v14335/concierge-location.mjs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.54] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.54] ${message}`);
}

function versionAtLeast(actual, expected) {
  const a = String(actual || '').split('.').map(Number);
  const e = String(expected || '').split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (e[index] || 0)) return true;
    if ((a[index] || 0) < (e[index] || 0)) return false;
  }
  return true;
}

expect(parseConciergePtNumberV14354('vinte e cinco') === 25, 'Conversão de número composto falhou.');
expect(parseConciergePtNumberV14354('três') === 3, 'Conversão de número acentuado falhou.');
expect(conciergeFormatTextV14354('A programação começa em um minutos.') === 'A programação começa em 1 min.', 'Singular de minuto não foi corrigido.');
expect(conciergeFormatTextV14354('O briefing abre as meio dia.') === 'O briefing abre às 12:00.', 'Meio-dia não foi normalizado.');
expect(conciergeFormatTextV14354('Apresentação às onze e trinta.') === 'Apresentação às 11:30.', 'Horário por extenso não foi convertido.');
expect(conciergeFormatTextV14354('Faltam vinte e cinco minutos e duas horas de janela.') === 'Faltam 25 min e 2 h de janela.', 'Durações não ficaram compactas.');
expect(conciergeFormatTextV14354('LA três sete três zero · um voos · uma etapas') === 'LA3730 · 1 voo · 1 etapa', 'Voo e contadores não ficaram em algarismos.');
expect(conciergeFormatTextV14354('Radar\nQualidade da consulta: 82% · 3 fontes úteis\nPortão A12') === 'Radar\nPortão A12', 'Métrica técnica ainda aparece no texto.');
expect(conciergeFormatTextV14354('METAR SBBR 291200Z 09005KT CAVOK') === 'METAR SBBR 291200Z 09005KT CAVOK', 'METAR bruto foi alterado.');
expect(conciergeFormatTextV14354(conciergeFormatTextV14354('começa em um minutos')) === conciergeFormatTextV14354('começa em um minutos'), 'Normalização textual não é idempotente.');

const scheduleReply = conciergeFinalizeReplyV14354('Próxima programação\nLA3730 às 12:00.', '/proximo');
expect(scheduleReply.endsWith(CONCIERGE_OFFICIAL_ROSTER_NOTICE_V14354), 'Resposta de escala não recebeu o aviso oficial.');
expect(!conciergeFinalizeReplyV14354('METAR SBBR 291200Z', '/metar SBBR raw').includes('escala oficial'), 'Resposta meteorológica recebeu aviso de escala sem necessidade.');

const now = new Date('2026-07-29T15:00:00.000Z');
const legacy = conciergeLocationState({ latitude: -16.6869, longitude: -49.2648, label: 'Goiânia/GO' }, { now });
expect(!legacy.fresh && legacy.status === 'stale', 'Localização legada sem updatedAt continua renascendo como atual.');
const fresh = conciergeLocationState({ latitude: -23.5505, longitude: -46.6333, label: 'São Paulo/SP', updatedAt: '2026-07-29T14:30:00.000Z' }, { now });
expect(fresh.fresh, 'Localização recente com updatedAt válido foi rejeitada.');
const expired = conciergeLocationState({ latitude: -16.6869, longitude: -49.2648, label: 'Goiânia/GO', updatedAt: '2026-07-29T07:00:00.000Z' }, { now });
expect(!expired.fresh && expired.status === 'stale', 'Localização vencida ainda é usada.');

const server = read('server.mjs');
const locationPolicy = read('server/v14335/concierge-location.mjs');
const patch = read('scripts/v14354/apply.mjs');
const applyChain = read('scripts/v139/apply.mjs');
const packageJson = JSON.parse(read('package.json'));

expect(server.includes("from './server/v14354/concierge-language.mjs';"), 'Normalizador não foi conectado ao servidor.');
expect(server.includes('conciergeFinalizeReplyV14354(decorated.reply, text)'), 'Resposta decorada não passa pela revisão final.');
expect(server.includes("updatedAt: new Date().toISOString()"), 'Localização enviada pelo app não recebe horário real.');
expect(!server.includes('Qualidade da consulta:'), 'Radar ainda expõe qualidade/fonte técnica.');
expect(locationPolicy.includes("location.updatedAt || location.capturedAt || ''"), 'Política não exige horário de captura explícito.');
expect(locationPolicy.includes("expiresAt: updatedAt ?"), 'Expiração ainda pode ser criada sem horário válido.');
expect(applyChain.includes("await import('../v14354/apply.mjs');"), 'v14.3.54 não está na preparação canônica.');
expect(versionAtLeast(packageJson.version, '14.3.54'), `Versão atual ${packageJson.version} é anterior à 14.3.54.`);
expect(Boolean(packageJson.scripts?.['regression:v14.3.54:concierge-language-location']), 'Script de regressão não registrado.');

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/financialRules.ts',
  'client/src/lib/complianceEngine.ts',
]) {
  expect(!patch.includes(`update('${protectedPath}'`), `Patch não deve alterar motor protegido: ${protectedPath}.`);
}

console.log('[v14.3.54] OK — Concierge direto em pt-BR, escala oficial protegida e localização antiga expirada.');
