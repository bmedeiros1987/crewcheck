/**
 * #510 (lado cliente) — desambiguação aeroporto x código de escala no AIMS/Escala.
 *
 * Três códigos IATA do allowlist do parser colidem com códigos de escala LATAM:
 * REC (Recife / "Re standard" em simulador), CPT e LIS. Duas funções em
 * aimsParser.ts tratavam qualquer `isKnownRosterCode(token)` como fronteira de
 * bloco sem checar antes se o token também era estação de uma perna em aberto:
 *   - findAimsVisualFlightBlockEnd — fim de bloco de voo dentro de uma coluna;
 *   - findAimsContinuationPrefixEnd — prefixo de continuidade ao costurar a
 *     virada de coluna civil, usado pelo stitching de voo noturno.
 *
 * O efeito era destrutivo: a perna inteira era descartada e substituída por um
 * dia fantasma "OTHER/REC", e a costura de meia-noite nunca capturava a estação
 * de chegada.
 *
 * REGRA: dentro de uma perna já aberta, um aeroporto válido só conta como
 * fronteira depois que a perna tem origem+destino. Antes disso é estação, não
 * atividade nova.
 *
 * Todos os casos abaixo são sintéticos e inline, no nível de token: nenhum
 * fixture de escala real é carregado. Cada caso exercita apenas a estrutura
 * mínima necessária (apresentação, boundary, continuidade, múltiplas jornadas,
 * token intercalado) e roda o parser de produção, não uma cópia.
 *
 * Substitui a versão anterior deste teste, que dependia de um fixture derivado
 * de uma competência mensal inteira (~97 KB). Ver #533 (minimização de dados).
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const INTERNALS = [
  'AIMS_HUMAN_AIRPORTS',
  'findAimsVisualFlightBlockEnd',
  'findAimsContinuationPrefixEnd',
  'stitchAimsOvernightColumnContinuations',
  'parseAimsVisualColumnDays',
  'isAimsVisualStandaloneBoundaryToken',
  'isAimsHumanAirport',
];

const checker = createChecker('P-1 #510 (cliente) — aeroporto x código de escala (sintético, sem fixture)');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/aimsParser.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-aims-510-',
  expose: { aimsParser: INTERNALS },
});
const aims = load('aimsParser');

const CONTEXT = {
  date: '15/08/2026',
  dayOfWeek: 'Sáb',
  dateObj: new Date(2026, 7, 15),
  base: 'BSB',
};
const ctx = (tokens) => ({ ...CONTEXT, rawBlock: tokens.join(' ') });
const parse = (tokens) => aims.parseAimsVisualColumnDays(tokens, ctx(tokens));
const legsOf = (days) => days.flatMap((day) => day.legs || []);
const phantom = (days, code) => days.filter((day) => day.type === 'OTHER' && day.pairingCode === code);
const show = (days) => JSON.stringify(days.map((day) => ({
  type: day.type,
  pairingCode: day.pairingCode,
  legs: (day.legs || []).map((leg) => `${leg.flightNumber} ${leg.origin}->${leg.destination} ${leg.departureTime}-${leg.arrivalTime}`),
})));

// ---------------------------------------------------------------------------
// 0. Premissa do bug — sem ela os casos seguintes não provam nada.
// ---------------------------------------------------------------------------
const COLLIDING = [...aims.AIMS_HUMAN_AIRPORTS].filter((code) => aims.isAimsVisualStandaloneBoundaryToken(code));
check('premissa: existem códigos IATA do allowlist que também são códigos de escala',
  COLLIDING.length > 0, JSON.stringify(COLLIDING));
check('premissa: REC, CPT e LIS são exatamente os códigos colidentes hoje',
  COLLIDING.slice().sort().join(',') === 'CPT,LIS,REC', JSON.stringify(COLLIDING));
check('premissa: REC é reconhecido como aeroporto E como fronteira de bloco',
  aims.isAimsHumanAirport('REC', '') && aims.isAimsVisualStandaloneBoundaryToken('REC'));
check('controle: GRU é aeroporto e nunca fronteira',
  aims.isAimsHumanAirport('GRU', '') && !aims.isAimsVisualStandaloneBoundaryToken('GRU'));

// ---------------------------------------------------------------------------
// 1. findAimsVisualFlightBlockEnd — estação dentro de perna em aberto.
//    Antes do fix: end=4 (bloco truncado em GRU, REC vira fronteira).
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '9001', '10:00', 'GRU', 'REC', '12:30', '(320)'];
  const end = aims.findAimsVisualFlightBlockEnd(tokens, 0);
  check('perna em aberto (1 estação vista): REC não trunca o bloco de voo',
    end === tokens.length, `end=${end} esperado=${tokens.length} tokens=${JSON.stringify(tokens)}`);
}

// ---------------------------------------------------------------------------
// 2. Contraprova — a regra é posicional, não uma isenção permanente.
//    Com origem+destino já fechados, o código colidente volta a ser fronteira.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '9002', '08:00', 'GRU', 'BSB', '09:30', '(320)', 'REC', '14:00'];
  const end = aims.findAimsVisualFlightBlockEnd(tokens, 0);
  check('perna fechada (2 estações vistas): REC volta a ser fronteira de bloco',
    end === 7, `end=${end} esperado=7 tokens=${JSON.stringify(tokens)}`);
}

// ---------------------------------------------------------------------------
// 3. Generalidade — não é hardcode de Recife: CPT e LIS se comportam igual.
// ---------------------------------------------------------------------------
for (const code of ['CPT', 'LIS']) {
  const tokens = ['LA', '9003', '10:00', 'GRU', code, '12:30', '(320)'];
  const end = aims.findAimsVisualFlightBlockEnd(tokens, 0);
  check(`regra é contextual e vale para ${code}, não só para REC`,
    end === tokens.length, `end=${end} tokens=${JSON.stringify(tokens)}`);
}

// ---------------------------------------------------------------------------
// 4. Voo noturno em coluna única — antes do fix a perna sumia inteira e
//    sobrava um dia fantasma OTHER/REC.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '3382', '23:30', 'GRU', 'REC', '02:35', '(320)'];
  const days = parse(tokens);
  const legs = legsOf(days);
  check('voo noturno GRU->REC é reconhecido como perna, não descartado',
    legs.length === 1, show(days));
  check('voo noturno: origem, destino, horários e virada de dia corretos',
    legs[0]?.origin === 'GRU' && legs[0]?.destination === 'REC'
    && legs[0]?.departureTime === '23:30' && legs[0]?.arrivalTime === '02:35'
    && legs[0]?.isNextDay === true, show(days));
  check('voo noturno: nenhum dia fantasma OTHER/REC',
    phantom(days, 'REC').length === 0, show(days));
  // #512 — um único horário antes da decolagem é a própria decolagem.
  check('#512: com um único horário antes da decolagem não se inventa apresentação',
    legs.length === 1 && legs[0].presentationTime === undefined, show(days));
}

// ---------------------------------------------------------------------------
// 5. Apresentação publicada — com dois horários antes da decolagem, o primeiro
//    é apresentação. Garante que o caso 4 prova ausência de herança, e não
//    apenas que a apresentação nunca é lida.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '3382', '22:20', '23:30', 'GRU', 'REC', '02:35', '(320)'];
  const legs = legsOf(parse(tokens));
  check('apresentação publicada (dois horários) é capturada como 22:20',
    legs[0]?.presentationTime === '22:20' && legs[0]?.departureTime === '23:30',
    JSON.stringify(legs));
}

// ---------------------------------------------------------------------------
// 6. Continuidade entre colunas civis — o caminho que só o corpus real cobria.
//    Antes do fix, findAimsContinuationPrefixEnd parava em REC e a costura
//    nunca capturava a estação de chegada.
// ---------------------------------------------------------------------------
{
  const prefixTokens = ['(...)', 'REC', '02:35', '(320)', 'DO'];
  const end = aims.findAimsContinuationPrefixEnd(prefixTokens);
  check('prefixo de continuidade avança até o boundary real (DO), não para em REC',
    end === 4, `end=${end} esperado=4 tokens=${JSON.stringify(prefixTokens)}`);

  const columns = [
    { page: 1, markerX: 0, date: '15/08/2026', dateObj: new Date(2026, 7, 15), dayOfWeek: 'Sáb', tokens: ['LA', '3382', '22:20', '23:30', 'GRU', '(...)'] },
    { page: 1, markerX: 1, date: '16/08/2026', dateObj: new Date(2026, 7, 16), dayOfWeek: 'Dom', tokens: ['(...)', 'REC', '02:35', '(320)', 'DO'] },
  ];
  const stitched = aims.stitchAimsOvernightColumnContinuations(columns);
  check('costura de meia-noite move a chegada REC/02:35 para a coluna de origem',
    stitched[0].tokens.join(' ').includes('REC 02:35 (320)'),
    JSON.stringify(stitched.map((column) => column.tokens)));
  check('costura de meia-noite não arrasta o boundary DO do dia seguinte',
    !stitched[0].tokens.includes('DO') && stitched[1].tokens.includes('DO'),
    JSON.stringify(stitched.map((column) => column.tokens)));
}

// ---------------------------------------------------------------------------
// 7. Múltiplas jornadas na mesma coluna, separadas por boundary real.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '9001', '08:00', 'GRU', 'REC', '11:00', '(320)', 'DO', 'LA', '9003', '15:00', 'REC', 'GRU', '18:00', '(320)'];
  const days = parse(tokens);
  const flights = days.filter((day) => day.type === 'VOO');
  check('duas jornadas separadas por DO produzem dois voos distintos',
    flights.length === 2
    && flights[0].legs?.[0]?.destination === 'REC'
    && flights[1].legs?.[0]?.origin === 'REC', show(days));
  check('boundary real (DO) entre jornadas é preservado como atividade própria',
    days.some((day) => day.type === 'DO'), show(days));
  check('múltiplas jornadas: nenhum dia fantasma OTHER/REC',
    phantom(days, 'REC').length === 0, show(days));
}

// ---------------------------------------------------------------------------
// 8. Token intercalado (PS/EXTRA) dentro da perna em aberto não quebra a regra.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '9005', '09:00', 'GRU', 'PS', 'REC', '12:00', '(320)'];
  const days = parse(tokens);
  const legs = legsOf(days);
  check('token intercalado (PS) entre origem e destino não descarta a perna',
    legs.length === 1 && legs[0].origin === 'GRU' && legs[0].destination === 'REC'
    && legs[0].departureTime === '09:00' && legs[0].arrivalTime === '12:00', show(days));
}

// ---------------------------------------------------------------------------
// 9. Não-regressão — REC como atividade legítima, sem perna adjacente em
//    aberto, continua sendo reconhecido como atividade separada.
// ---------------------------------------------------------------------------
{
  const tokens = ['LA', '9002', '08:00', 'GRU', 'BSB', '09:30', '(320)', 'REC', '14:00', '18:00'];
  const days = parse(tokens);
  const flightDay = days.find((day) => day.type === 'VOO');
  check('voo anterior já fechado (GRU->BSB) permanece intacto',
    flightDay?.legs?.length === 1 && flightDay.legs[0].destination === 'BSB', show(days));
  check('atividade REC legítima (sem perna em aberto) segue reconhecida à parte',
    phantom(days, 'REC').length === 1, show(days));
}

cleanup();
process.exit(checker.report());
