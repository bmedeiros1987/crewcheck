/**
 * #303 — contagem de Folgas e Descansos no preview de importação.
 *
 * O gate que já existia para esta superfície (regression-p0-canonical-surface-metrics)
 * é textual: afirma que Home.tsx contém `Folgas: ${scheduleCounts.daysOff}` e
 * `Descansos: ${scheduleCounts.recoveryRest}`. Ele fixa a fiação, e por construção
 * não consegue perceber um número errado — foi exatamente esse o buraco quando o
 * preview passou a mostrar Folgas e Descansos divergentes.
 *
 * Este teste executa o agregador de produção, countScheduleCategories, sobre casos
 * sintéticos no nível de campo. Nenhum PDF, fixture mensal ou dado pessoal é
 * carregado (ver #533).
 *
 * REGRA (decidida no #303): o código formal publicado prevalece sobre título e
 * pairingCode quando houver conflito.
 *   - DO, DOF, FOLGA, DRC  -> Folga, mesmo que o rótulo diga "Descanso";
 *   - DR e códigos formais de repouso -> Descanso;
 *   - título e pairingCode só decidem quando não há código formal conclusivo;
 *   - "Descanso na base", inferido por continuidade e sem código formal de folga,
 *     segue sendo Descanso.
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const checker = createChecker('P-1 #303 — Folgas x Descansos no agregador do preview');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/scheduleActivityClassification.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-303-counts-',
  expose: {
    scheduleActivityClassification: ['countScheduleCategories', 'classifyScheduleActivity'],
  },
});
const classification = load('scheduleActivityClassification');
const classify = (activity) => classification.classifyScheduleActivity(activity);

// ---------------------------------------------------------------------------
// 1. Código formal sozinho — a base da regra.
// ---------------------------------------------------------------------------
check('DO publicado é Folga', classify({ kind: 'rest', day: { type: 'DO' } }) === 'FOLGA');
check('DR publicado é Descanso', classify({ kind: 'rest', day: { type: 'DR' } }) === 'REPOUSO');
check('DRC publicado é Folga', classify({ kind: 'rest', day: { type: 'DRC' } }) === 'FOLGA');

// ---------------------------------------------------------------------------
// 2. Conflito entre código formal e rótulo — o defeito reproduzido no #303.
//    Antes da correção, o rótulo "Descanso" movia o dia para Descansos porque o
//    conjunto de repouso era consultado sobre todos os campos ao mesmo tempo.
// ---------------------------------------------------------------------------
for (const code of ['DO', 'DOF', 'FOLGA', 'DRC']) {
  for (const label of ['Descanso', 'Descanso na base', 'DESCANSO REGULAMENTAR']) {
    check(`${code} publicado continua Folga com o rótulo "${label}"`,
      classify({ kind: 'rest', day: { type: code }, title: label }) === 'FOLGA',
      `recebido=${classify({ kind: 'rest', day: { type: code }, title: label })}`);
  }
}

check('DO publicado vence pairingCode DR',
  classify({ kind: 'rest', day: { type: 'DO', pairingCode: 'DR' } }) === 'FOLGA');
check('DO publicado vence pairingCode textual de descanso',
  classify({ kind: 'rest', day: { type: 'DO', pairingCode: 'DESCANSO ENTRE JORNADAS' } }) === 'FOLGA');

// ---------------------------------------------------------------------------
// 3. Contraprova — a regra não silencia o rótulo, apenas o rebaixa. Sem código
//    formal conclusivo ele continua decidindo.
// ---------------------------------------------------------------------------
check('sem código formal, rótulo "Descanso na base" ainda é Descanso',
  classify({
    kind: 'stay',
    title: 'Descanso na base',
    day: { type: 'DESCANSO_BASE_CONTINUIDADE', pairingCode: 'DESCANSO BASE ENTRE JORNADAS', legs: [] },
    canonical: { kind: 'stay', publishedDay: { type: 'DESCANSO_BASE_CONTINUIDADE', pairingCode: 'DESCANSO BASE ENTRE JORNADAS', legs: [] } },
  }) === 'REPOUSO');

check('sem código formal, rótulo "Folga" ainda é Folga',
  classify({ kind: 'rest', title: 'Folga' }) === 'FOLGA');

check('DR publicado com rótulo "Folga" continua Descanso',
  classify({ kind: 'rest', day: { type: 'DR' }, title: 'Folga' }) === 'REPOUSO');

// ---------------------------------------------------------------------------
// 4. Efeito agregado — é o número que o preview mostra.
// ---------------------------------------------------------------------------
{
  const mes = [
    { kind: 'rest', day: { type: 'DO' }, title: 'Folga' },
    { kind: 'rest', day: { type: 'DO' }, title: 'Descanso' },
    { kind: 'rest', day: { type: 'DOF' }, title: 'Descanso na base' },
    { kind: 'rest', day: { type: 'FOLGA' }, title: 'Descanso' },
    { kind: 'rest', day: { type: 'DRC' } },
    { kind: 'rest', day: { type: 'DR' } },
    { kind: 'rest', day: { type: 'DR' }, title: 'Folga' },
    {
      kind: 'stay',
      title: 'Descanso na base',
      day: { type: 'DESCANSO_BASE_CONTINUIDADE', legs: [] },
      canonical: { kind: 'stay', publishedDay: { type: 'DESCANSO_BASE_CONTINUIDADE', legs: [] } },
    },
  ];
  const counts = classification.countScheduleCategories(mes);
  check('agregado: 5 folgas publicadas contadas como Folgas',
    counts.daysOff === 5, `daysOff=${counts.daysOff} recoveryRest=${counts.recoveryRest}`);
  check('agregado: 3 repousos contados como Descansos',
    counts.recoveryRest === 3, `daysOff=${counts.daysOff} recoveryRest=${counts.recoveryRest}`);
  check('agregado: soma de folga+repouso preservada',
    counts.rest === mes.length, `rest=${counts.rest} esperado=${mes.length}`);
  check('agregado: nada cai em DESCONHECIDA',
    counts.unknown === 0, `unknown=${counts.unknown}`);
}

cleanup();
process.exit(checker.report());
