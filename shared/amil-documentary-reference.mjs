import { officialAmilSource, AMIL_GUIDE_URL } from './amil-coverage.mjs';
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
export const AMIL_DOCUMENTARY_QUERY = {
  identityKind: 'official_query_product_label', productLabel: 'AMIL S450 COPART ADM', planCode: 'S450',
  state: 'DF', city: 'BRASILIA', neighborhoodFilter: 'TODOS OS BAIRROS', serviceCode: 'PS24H',
  serviceLabel: 'PRONTO-SOCORRO 24H (URGENCIA E EMERGENCIA)', specialty: 'PRONTO SOCORRO ADULTO',
};
export const AMIL_DOCUMENTARY_NOTICE = 'Referência documental de consulta oficial apresentada pelo usuário. Captura recebida em 09/10/2026 às 09:38 UTC; a data original da consulta não aparece. Presença na consulta mostrada não confirma rede atual, elegibilidade ou autorização individual. Confira no Guia Amil antes de usar.';
const rows = [
  ['ASM - HOSPITAL AGUAS CLARAS', 'RUA ARARIBA, 05 LT 03', 'SUL (AGUAS CLARAS)', '71927360', ['61-4020-0057']],
  ['ASM - HOSPITAL ALVORADA BRASILIA', 'QUADRA SEPS, 710910 CONJUNTO B BLOCO I E II', 'ASA SUL', '70390108', ['61-3003-2598', '61-3799-1000']],
  ['ASM - HOSPITAL BRASILIA', 'RUA SHIS QI 15 BLOCO G, 15', 'SETOR DE MANSOES DOM BOSCO (LAGO SUL)', '71635580', ['61-4020-0057']],
  ['HOSPITAL DAHER', 'RUA SHIS QI 7 AREA ESPECIAL F, 7', 'SETOR DE HABITACOES INDIVIDUAIS SUL', '71615660', ['61-3213-4832', '61-3213-4848']],
  ['HOSPITAL MARIA AUXILIADORA', 'AREA ESPECIAL, 1418 NUMERO 16 LADO OESTE', 'SETOR LESTE (GAMA)', '72460000', ['61-3445-0000', '61-3203-9400']],
  ['HOSPITAL SANTA LUCIA', 'SETOR SHLS QUADRA, 716 CONJUNTO C', 'ASA SUL', '70390700', ['61-3445-0000']],
  ['HOSPITAL SANTA MARTA', 'QUADRA QSE, 17 AREA ESPECIAL NUMERO 01 SETOR SUL', 'TAGUATINGA SUL', '72025110', ['61-3451-3000', '61-99972-5548']],
  ['HOSPITAL SAO FRANCISCO', 'RUA QNN 28, 28 AREA ESPECIAL C', 'CEILANDIA SUL', '72220280', ['61-3378-9000', '61-3378-9001']],
  ['HOSPITAL SAO MATEUS', 'RUA SRES QUADRA 2 BLOCO A, AREA ESPECIAL 1', 'CRUZEIRO VELHO', '70648010', ['61-3233-2122']],
  ['PRONTONORTE', 'SETOR SHLN, 516 CONJUNTO G LOTE 07', 'ASA NORTE', '70770560', ['61-3448-9100']],
  ['SLRD HOSPITAL SANTA HELENA - REDE DOR SAO LUIZ SA', 'SETOR SHLN, CONJUNTO D', 'ASA NORTE', '70770560', ['61-3261-3000', '61-3261-3050']],
];
export const AMIL_DOCUMENTARY_CAPTURE = {
  query: AMIL_DOCUMENTARY_QUERY,
  provenance: { sourceKind: 'user_presented_official_query', sourceUrl: AMIL_GUIDE_URL,
    receivedAt: '2026-10-09T09:38:00Z',
    observedAt: null, originalQueryDateKnown: false, selectorAndSummaryAgree: true,
    review: { status: 'reviewed', method: 'independent_visual_transcriptions', date: '2026-10-09' } },
  units: rows.map(([name, address, neighborhood, postalCode, phones], index) => ({
    id: `amil-documentary-20261009-${index + 1}`, name, address, neighborhood, postalCode, phones,
    city: 'BRASILIA', state: 'DF',
  })),
};
// Label identity is confined to documentary references. It never authorizes
// current coverage, substitutes public codes, or enters confirmed providers.
export function amilDocumentaryReferences(selection = {}, capture = AMIL_DOCUMENTARY_CAPTURE) {
  const query = capture?.query, source = capture?.provenance;
  if (selection.identityKind !== 'official_query_product_label' || !query || !source) return [];
  if (source.sourceKind !== 'user_presented_official_query' || !officialAmilSource(source.sourceUrl) || source.review?.status !== 'reviewed' || !source.selectorAndSummaryAgree || !source.receivedAt || source.originalQueryDateKnown !== false || source.observedAt !== null) return [];
  for (const field of ['productLabel', 'planCode', 'state', 'city', 'serviceCode', 'specialty']) if (!query[field] || fold(selection[field]) !== fold(query[field])) return [];
  if (selection.productCode || selection.networkCode) return [];
  return (Array.isArray(capture.units) ? capture.units : []).filter(unit => unit.id && unit.name && unit.address && unit.neighborhood && unit.postalCode && fold(unit.city) === fold(query.city) && fold(unit.state) === fold(query.state) && (!selection.query || fold(selection.query).split(' ').every(word => fold(unit.name).includes(word)))).map(unit => ({
    ...unit, coverageStatus: 'unknown', documentationStatus: 'official_query_reference', covered: false,
    mapsQuery: [unit.name, unit.address, unit.neighborhood, unit.postalCode, unit.city, unit.state].join(', '),
    provenance: source, queryIdentity: query,
  }));
}
