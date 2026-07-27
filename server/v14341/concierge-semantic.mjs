import {
  normalizeConciergeNaturalTextV14338 as normalizeBase,
  interpretConciergeNaturalTextV14338 as interpretBase,
  buildConciergeContextV14338 as buildContextBase,
  isConciergeContextFreshV14338 as isContextFreshBase,
  parseConciergeNaturalDateV14338 as parseDateBase,
} from '../v14338/concierge-semantic.mjs';

const RESERVED_AIRPORT_WORDS = new Set([
  'METAR','TAF','ATIS','QUAL','COMO','ONDE','QUEM','QUE','VOO','HOJE','BASE','CASA','TEMPO','CLIMA','PARA','PORTAO','PORTÃO','ROTA','SAIR',
]);

function validAirportToken(value = '') {
  const code = String(value || '').trim().toUpperCase();
  if (!code || RESERVED_AIRPORT_WORDS.has(code)) return false;
  if (/^[A-Z]{3}$/.test(code)) return true;
  return /^(?:SB|SD|SN|SW|SS|SI|SJ|K|C|M|L|E|O|R|U|Z)[A-Z]{2}$/.test(code);
}

export function normalizeConciergeNaturalTextV14341(value = '') {
  return normalizeBase(value);
}
export function parseConciergeNaturalDateV14341(text = '', now = new Date()) {
  return parseDateBase(text, now);
}
export function isConciergeContextFreshV14341(context = null, now = new Date()) {
  return isContextFreshBase(context, now);
}
export function interpretConciergeNaturalTextV14341(text = '', previousContext = null, now = new Date()) {
  const interpreted = interpretBase(text, previousContext, now);
  const airport = validAirportToken(interpreted.airport) ? interpreted.airport : '';
  let rewrite = interpreted.rewrite;
  if (interpreted.intent === 'weather' && interpreted.airport && !airport) rewrite = '/metar decodificado';
  return { ...interpreted, version: '14.3.41', airport, rewrite };
}
export function buildConciergeContextV14341(interpretation = {}, previousContext = null, now = new Date(), extra = {}) {
  return { ...buildContextBase(interpretation, previousContext, now, extra), version: '14.3.41' };
}

export const CONCIERGE_SEMANTIC_POLICY_V14341 = Object.freeze({
  contextTtlHours: 6,
  storesRawConversation: false,
  sourceOfTruth: 'active-canonical-roster',
  externalGenerativeModelRequired: false,
});
