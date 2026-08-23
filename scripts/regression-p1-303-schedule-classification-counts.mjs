/**
 * #303 — contagem de Folgas e Descansos no preview de importação.
 *
 * O gate que já existia para esta superfície (regression-p0-canonical-surface-metrics)
 * é textual: afirma que Home.tsx contém `Folgas: ${scheduleCounts.daysOff}` e
 * `Descansos: ${scheduleCounts.recoveryRest}`. Ele fixa a fiação, e por construção
 * não consegue perceber um número errado — foi exatamente esse o buraco quando o
 * preview mostrou 7 Folgas para uma escala que publica 11 Off Days.
 *
 * Este teste executa o agregador de produção, countScheduleCategories, sobre casos
 * sintéticos no nível de campo. Nenhum PDF, fixture mensal ou dado pessoal é
 * carregado (ver #533).
 *
 * CONTRATO SEMÂNTICO (#303):
 *   1. DR é Day Off Requested — folga pedida. É FOLGA, nunca Descanso. A tabela
 *      canônica do projeto já dizia isso: rosterCodes.ts declara DR como
 *      { description: 'Folga Pedida', category: 'DAY_OFF' }. O classificador é que
 *      divergia, listando DR entre os códigos de repouso.
 *   2. DR continua identificável como subtipo, via isRequestedDayOff e do contador
 *      requestedDaysOff, que é subconjunto de daysOff e não soma duas vezes.
 *   3. O código formal publicado prevalece sobre título e pairingCode: um dia
 *      publicado como DO/DOF/FOLGA/DR/DRC é folga ainda que o rótulo diga
 *      "Descanso".
 *   4. Repouso verdadeiro continua Descanso quando não há código formal de folga —
 *      "Descanso na base", inferido por continuidade física, é o caso.
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const checker = createChecker('P-1 #303 — Folgas x Descansos no agregador do preview');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/scheduleActivityClassification.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-303-counts-',
  expose: {
    scheduleActivityClassification: ['countScheduleCategories', 'classifyScheduleActivity', 'isRequestedDayOff'],
  },
});
const classification = load('scheduleActivityClassification');
const rosterCodes = load('rosterCodes');
const classify = (activity) => classification.classifyScheduleActivity(activity);
const dayWith = (type, extra = {}) => ({ kind: 'rest', day: { type }, ...extra });

// ---------------------------------------------------------------------------
// 0. Premissa — o contrato não é invenção deste teste: está na tabela canônica.
//    Se alguém reclassificar DR em rosterCodes.ts, este gate falha primeiro.
// ---------------------------------------------------------------------------
{
  const dr = rosterCodes.getRosterCodeDefinition('DR');
  check('premissa: rosterCodes.ts declara DR como DAY_OFF',
    dr?.category === 'DAY_OFF', `categoria=${dr?.category} descrição=${dr?.description}`);
  check('premissa: a descrição canônica de DR é folga pedida',
    /FOLGA/i.test(String(dr?.description || '')), `descrição=${dr?.description}`);
}

// ---------------------------------------------------------------------------
// 1. Código formal isolado.
// ---------------------------------------------------------------------------
check('DO publicado é Folga', classify(dayWith('DO')) === 'FOLGA');
check('DR publicado é Folga, não Descanso', classify(dayWith('DR')) === 'FOLGA',
  `recebido=${classify(dayWith('DR'))}`);
check('DRC publicado é Folga', classify(dayWith('DRC')) === 'FOLGA');
check('REST publicado é Descanso', classify(dayWith('REST')) === 'REPOUSO');

// ---------------------------------------------------------------------------
// 2. DR segue distinguível como subtipo, sem sair de Folgas.
// ---------------------------------------------------------------------------
// A API do subtipo é nova nesta slice. Sem a guarda, revertendo a implementação o
// teste morre aqui com TypeError e esconde as asserções de contagem — que são o
// que realmente prova o defeito. Com a guarda, o fail-before reporta a lacuna e
// as contagens seguem sendo medidas.
const hasRequestedDayOffApi = typeof classification.isRequestedDayOff === 'function';
check('classificador expõe isRequestedDayOff para identificar o subtipo', hasRequestedDayOffApi);
if (hasRequestedDayOffApi) {
  check('DR é reconhecido como folga pedida', classification.isRequestedDayOff(dayWith('DR')));
  check('DO não é folga pedida', !classification.isRequestedDayOff(dayWith('DO')));

  // O subtipo não pode contradizer a categoria. Um dia com código formal de
  // repouso e um DR vindo de pairingCode ou título era classificado REPOUSO e,
  // ao mesmo tempo, marcado como folga pedida — o fallback passando por cima do
  // código formal justamente onde a hierarquia deveria mandar.
  for (const [nome, activity] of [
    ['REST formal + pairingCode DR', { kind: 'rest', day: { type: 'REST', pairingCode: 'DR' } }],
    ['REPOUSO formal + pairingCode DR', { kind: 'rest', day: { type: 'REPOUSO', pairingCode: 'DR' } }],
    ['REST formal + título DR', { kind: 'rest', day: { type: 'REST' }, title: 'DR' }],
    ['DESCANSO formal + pairingCode DR', { kind: 'rest', day: { type: 'DESCANSO', pairingCode: 'DR' } }],
  ]) {
    check(`${nome} é Descanso`, classify(activity) === 'REPOUSO', `recebido=${classify(activity)}`);
    check(`${nome} não é marcado como folga pedida`,
      !classification.isRequestedDayOff(activity),
      `categoria=${classify(activity)} folgaPedida=${classification.isRequestedDayOff(activity)}`);
  }

  // Invariante geral: folga pedida implica categoria FOLGA, para qualquer entrada.
  for (const activity of [
    dayWith('DR'), dayWith('DO'), dayWith('DRC'), dayWith('REST'),
    { kind: 'rest', day: { type: 'REST', pairingCode: 'DR' } },
    { kind: 'rest', day: { type: 'DO', pairingCode: 'DR' } },
    { kind: 'rest', title: 'DR' },
    { kind: 'stay', day: { type: 'DESCANSO_BASE_CONTINUIDADE' }, title: 'Descanso na base' },
  ]) {
    check('invariante: folga pedida implica categoria FOLGA',
      !classification.isRequestedDayOff(activity) || classify(activity) === 'FOLGA',
      JSON.stringify(activity));
  }

  // Contrapartida: sem código formal, DR no fallback ainda marca folga pedida —
  // a guarda restringe a contradição, não o caminho legítimo.
  check('sem código formal, título DR ainda é folga pedida',
    classify({ kind: 'rest', title: 'DR' }) === 'FOLGA'
    && classification.isRequestedDayOff({ kind: 'rest', title: 'DR' }));
}

// ---------------------------------------------------------------------------
// 3. O caso que motivou o #303 — 7 DO + 4 DR devem somar 11 Folgas.
// ---------------------------------------------------------------------------
{
  const mes = [
    ...Array.from({ length: 7 }, () => dayWith('DO')),
    ...Array.from({ length: 4 }, () => dayWith('DR')),
  ];
  const counts = classification.countScheduleCategories(mes);
  check('7 DO + 4 DR = 11 Folgas',
    counts.daysOff === 11, `daysOff=${counts.daysOff} recoveryRest=${counts.recoveryRest}`);
  check('7 DO + 4 DR = 0 Descansos',
    counts.recoveryRest === 0, `recoveryRest=${counts.recoveryRest}`);
  check('das 11 folgas, 4 são folgas pedidas',
    counts.requestedDaysOff === 4, `requestedDaysOff=${counts.requestedDaysOff}`);
  check('o subtipo não soma duas vezes: requestedDaysOff ⊆ daysOff',
    counts.requestedDaysOff <= counts.daysOff && counts.rest === 11,
    `rest=${counts.rest} daysOff=${counts.daysOff}`);
}

// ---------------------------------------------------------------------------
// 4. Conflito entre código formal e rótulo — o rótulo não sobrescreve a folga.
// ---------------------------------------------------------------------------
for (const code of ['DO', 'DOF', 'FOLGA', 'DR', 'DRC']) {
  for (const label of ['Descanso', 'Descanso na base', 'DESCANSO REGULAMENTAR']) {
    const activity = dayWith(code, { title: label });
    check(`${code} publicado continua Folga com o rótulo "${label}"`,
      classify(activity) === 'FOLGA', `recebido=${classify(activity)}`);
  }
}

check('DO publicado vence pairingCode de descanso',
  classify({ kind: 'rest', day: { type: 'DO', pairingCode: 'DESCANSO ENTRE JORNADAS' } }) === 'FOLGA');

// ---------------------------------------------------------------------------
// 5. Contraprova — a regra rebaixa o rótulo, não o silencia. Sem código formal de
//    folga, repouso verdadeiro continua Descanso.
// ---------------------------------------------------------------------------
check('sem código formal, rótulo "Descanso na base" ainda é Descanso',
  classify({
    kind: 'stay',
    title: 'Descanso na base',
    day: { type: 'DESCANSO_BASE_CONTINUIDADE', pairingCode: 'DESCANSO BASE ENTRE JORNADAS', legs: [] },
    canonical: { kind: 'stay', publishedDay: { type: 'DESCANSO_BASE_CONTINUIDADE', pairingCode: 'DESCANSO BASE ENTRE JORNADAS', legs: [] } },
  }) === 'REPOUSO');

check('sem código formal, rótulo "Repouso" ainda é Descanso',
  classify({ kind: 'rest', title: 'Repouso' }) === 'REPOUSO');

check('sem código formal, rótulo "Folga" ainda é Folga',
  classify({ kind: 'rest', title: 'Folga' }) === 'FOLGA');

// ---------------------------------------------------------------------------
// 6. Mês misto — folgas publicadas, folgas pedidas e um repouso inferido.
// ---------------------------------------------------------------------------
{
  const mes = [
    dayWith('DO', { title: 'Folga' }),
    dayWith('DO', { title: 'Descanso' }),
    dayWith('DOF', { title: 'Descanso na base' }),
    dayWith('FOLGA', { title: 'Descanso' }),
    dayWith('DRC'),
    dayWith('DR'),
    dayWith('DR', { title: 'Descanso' }),
    {
      kind: 'stay',
      title: 'Descanso na base',
      day: { type: 'DESCANSO_BASE_CONTINUIDADE', legs: [] },
      canonical: { kind: 'stay', publishedDay: { type: 'DESCANSO_BASE_CONTINUIDADE', legs: [] } },
    },
  ];
  const counts = classification.countScheduleCategories(mes);
  check('mês misto: 7 folgas publicadas ou pedidas',
    counts.daysOff === 7, `daysOff=${counts.daysOff} recoveryRest=${counts.recoveryRest}`);
  check('mês misto: 1 descanso inferido',
    counts.recoveryRest === 1, `recoveryRest=${counts.recoveryRest}`);
  check('mês misto: 2 folgas pedidas',
    counts.requestedDaysOff === 2, `requestedDaysOff=${counts.requestedDaysOff}`);
  check('mês misto: soma preservada e nada em DESCONHECIDA',
    counts.rest === mes.length && counts.unknown === 0,
    `rest=${counts.rest} unknown=${counts.unknown}`);
}

cleanup();
process.exit(checker.report());
