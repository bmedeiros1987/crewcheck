import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

// #510 real regression, 17/08/2026: LA3730 BSB->FOR's published presentation
// (09:25) was displayed as 08:29 - the exact end time of the PREVIOUS day's rest/
// off/pernoite boundary. Root cause, confirmed empirically (not by inspection):
// client/src/lib/aimsParser.ts's parseFlightDay() has a heuristic for "some
// Android/iOS PDF extracts print the presentation before the first LA token" -
// but when the block arrives via the parser's own documented "(...)" continuation
// path (a previous day's rest/off/pernoite spilling into the same visual block,
// isLayoverStart=true), that heuristic had no way to tell a genuine presentation
// apart from a leftover boundary token from a DIFFERENT, earlier activity. The
// fix disables the heuristic specifically for isLayoverStart=true - an existing
// parameter that was threaded through but never used - falling back to
// parseLegTokens()'s own reportCandidate (scoped strictly to the flight's own leg
// tokens, immune to cross-block contamination) or the flight's own departure time
// if no separate presentation exists at all. Never a foreign activity's boundary.
//
// This never touches the canonical schedule engine, continuity logic, or any
// consumer - every downstream reader (Roster/FlightDeck/Saída Inteligente/
// Despertador/regulamentação) reads day.dutyReport as-is, so fixing the single
// source of truth fixes every consumer uniformly without duplicating logic in
// each one.

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-510-presentation-boundary-'));
try {
  await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      lib: {
        entry: path.resolve('client/src/lib/aimsParser.ts'),
        formats: ['es'],
        fileName: () => 'aims-parser.mjs',
      },
      outDir,
      emptyOutDir: true,
      minify: false,
    },
  });

  const { parseAimsRoster } = await import(`${pathToFileURL(path.join(outDir, 'aims-parser.mjs')).href}?v=${Date.now()}`);

  function header(range) {
    return `Escala de Tripulante Convertida para padrão AIMS\nTripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -${range} -Timezone Brasília (-3)\n`;
  }
  function findDay(roster, dateKey) {
    return (roster.days || []).find((d) => d.date === dateKey);
  }

  // ---------------------------------------------------------------------------
  // 1) A prova canônica pedida: fonte, boundary anterior e resultado final nunca
  // se misturam. Folga termina numa atividade com horário próprio (HSB) até
  // 08:29; LA3730 chega via "(...)" com um token solto 08:29 colado antes do LA
  // - exatamente a forma real do bug de 17/08/2026.
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun HSB 06:00 08:29\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);

    const previousBoundary = findDay(roster, '16/08/2026');
    const flightDay = findDay(roster, '17/08/2026');
    const leg = flightDay?.legs?.find((l) => l.flightNumber === 'LA3730');

    // source presentation = 09:25 (o que o parseLegTokens acha, escopado à perna)
    // previous boundary = 08:29 (preservado na PRÓPRIA atividade anterior)
    // canonical presentation = 09:25 (o que este dia deve carregar)
    // consumer presentation = 09:25 (o que qualquer consumidor vai ler de day.dutyReport)
    //
    // A prova de separação aqui é de PROVENIÊNCIA, não de coincidência de relógio:
    // cada valor vem do seu próprio objeto/fonte (a atividade anterior carrega seu
    // PRÓPRIO dutyDebrief; o voo carrega seu PRÓPRIO dutyReport, calculado por
    // parseLegTokens a partir unicamente dos tokens da sua própria perna). Não
    // comparamos os dois valores entre si - dois conceitos diferentes podem
    // legitimamente coincidir em horário sem que isso indique contaminação; o que
    // #510 exige é que a fonte de cada um esteja correta, não que os relógios sejam
    // diferentes.
    // Oracle atualizado (proveniência, não conveniência): "HSB 06:00 08:29" não tem
    // estação e 06:00 está na lista conservadora de durações, então nada prova qual
    // relógio é início ou fim. A versão anterior exigia dutyDebrief 08:29, que só
    // existia porque o parser promovia 08:29 a INÍCIO "published" (janela
    // 08:29–08:29 com fim 'estimated') - nunca foi um fim publicado. Agora a janela
    // fica não resolvida e o 08:29 continua na própria fonte da atividade anterior
    // (texto original do dia 16), sem migrar para o voo. Com estações, o fim
    // publicado 08:29 é preservado no próprio objeto (variante abaixo).
    assert.deepEqual([previousBoundary?.type, previousBoundary?.dutyReport, previousBoundary?.dutyDebrief, previousBoundary?.dutyReportSource], ['HSB', null, null, 'unknown'], 'a atividade anterior (HSB) sem estação fica não resolvida: 08:29 não é promovido a início nem 06:00 inferido');
    assert.ok(String(roster.rawText || '').includes('16Aug Sun HSB 06:00 08:29'), 'o boundary 08:29 permanece na fonte original da atividade anterior');
    assert.equal(flightDay?.type, 'VOO');
    assert.equal(flightDay?.dutyReport, '09:25', 'a apresentação canônica do LA3730 deve ser 09:25 - nunca herdar o boundary da atividade anterior');
    assert.equal(leg?.flightNumber, 'LA3730');
    assert.equal(leg?.origin, 'BSB');
    assert.equal(leg?.destination, 'FOR');
    assert.equal(leg?.departureTime, '10:15', 'partida do LA3730 deve permanecer 10:15');
    assert.equal(leg?.arrivalTime, '12:55');
  }

  {
    // 1b) Mesma forma com estações: o fim publicado 08:29 pertence à atividade
    // anterior e nunca vira apresentação do voo.
    const roster = parseAimsRoster(`${header('16/08/2026 até18/08/2026')}\n16Aug Sun HSB BSB 06:00 BSB 08:29\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55\n18Aug Tue DO\n`);
    const previousBoundary = findDay(roster, '16/08/2026');
    const flightDay = findDay(roster, '17/08/2026');
    assert.deepEqual([previousBoundary?.dutyReport, previousBoundary?.dutyDebrief, previousBoundary?.dutyDebriefSource], ['06:00', '08:29', 'published'], 'com estações a atividade anterior preserva seu próprio fim publicado 08:29');
    assert.equal(flightDay?.dutyReport, '09:25', 'o voo nunca herda o boundary 08:29 da atividade anterior');
  }

  // ---------------------------------------------------------------------------
  // 2) Voo sem apresentação publicada (só decolagem) via "(...)" continuação: o
  // que #510 exige aqui é só que o boundary da folga/descanso anterior NUNCA seja
  // promovido a apresentação. Este teste não toma posição sobre qual deveria ser
  // o valor "correto" na ausência de apresentação publicada - parseLegTokens()
  // já cai, hoje, no fallback pré-existente e inalterado (partida do próprio
  // voo), mas isso é comportamento anterior a este patch, fora do contrato que
  // #510/#403 definiram (ausência de apresentação deve permanecer ausência/null
  // na camada canônica; um fallback operacional pertence à camada apropriada,
  // não à apresentação canônica). Não fixamos esse fallback como desejado aqui -
  // é um débito separado, fora de escopo deste patch.
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun DO\n17Aug Mon (...) 08:29 LA 3730 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    const flightDay = findDay(roster, '17/08/2026');
    assert.notEqual(flightDay?.dutyReport, '08:29', 'sem apresentação publicada, o boundary 08:29 da folga anterior nunca pode ser promovido a apresentação - único contrato que #510 exige aqui');
  }

  // ---------------------------------------------------------------------------
  // 3) Voo após pernoite (PERNOITE_CONTINUIDADE é resolvido por rosterContinuity.ts
  // como um dia SINTÉTICO separado - aqui provamos o análogo direto no parser: um
  // dia de pernoite/hotel real seguido de "(...)" com boundary solto).
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun LA 3001 18:00 18:30 BSB FOR 20:00 (...) FOR 08:29\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    const flightDay = findDay(roster, '17/08/2026');
    assert.equal(flightDay?.dutyReport, '09:25', 'voo após pernoite deve manter 09:25, nunca herdar o horário de liberação do pernoite anterior');
  }

  // ---------------------------------------------------------------------------
  // 4) Voo após descanso (DR) via "(...)".
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun DR\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    assert.equal(findDay(roster, '17/08/2026')?.dutyReport, '09:25', 'voo após descanso (DR) deve manter 09:25');
  }

  // ---------------------------------------------------------------------------
  // 5) Voo após folga (DO/OFF) via "(...)".
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun OFF\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    assert.equal(findDay(roster, '17/08/2026')?.dutyReport, '09:25', 'voo após folga (OFF) deve manter 09:25');
  }

  // ---------------------------------------------------------------------------
  // 6) Duas pernas na mesma jornada via "(...)"; a segunda perna não tem
  // apresentação própria - a jornada inteira continua ancorada em 09:25, nunca
  // em 08:29, e as pernas/rotas permanecem íntegras.
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun DO\n17Aug Mon (...) 08:29 LA 3730 09:25 10:15 BSB FOR 12:55 LA 3731 13:30 FOR REC 14:40\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    const flightDay = findDay(roster, '17/08/2026');
    assert.equal(flightDay?.dutyReport, '09:25');
    assert.deepEqual(
      (flightDay?.legs || []).map((l) => `${l.flightNumber}:${l.origin}-${l.destination}`),
      ['LA3730:BSB-FOR', 'LA3731:FOR-REC'],
      'as duas pernas da jornada devem permanecer íntegras e na ordem correta',
    );
  }

  // ---------------------------------------------------------------------------
  // 7) Sobreaviso publicado antes de um voo no mesmo dia. Oracle atualizado
  // (semântica, não conveniência): a versão anterior exigia o voo DENTRO do dia
  // HSB e o início do sobreaviso como apresentação do "acionamento". Isso
  // contradiz (a) o contrato da #1254 - atividade publicada antes do voo é
  // jornada própria e o voo mantém a própria APZ publicada; (b) o corpus oficial
  // anonimizado (scripts/fixtures/official-roster-2026-06/07-*): "não inferir
  // acionamento de HSBE/ASB", "ASB e acionamento como atividades distintas";
  // (c) a regra conservadora de horários sem estação
  // (regression-aims-activity-before-flight-parity: "bare duration-like tokens
  // keep legacy conservative filter"). Com relógios sem estação e 06:00 na lista
  // de durações, nada prova o início: a janela fica não resolvida (fonte
  // 'unknown'), sem inferir 06:00 e sem promover 09:00. Com estações, a janela
  // publicada 06:00–09:00 é mantida. Cobertura ampliada: as duas formas, o voo,
  // o texto original e a ausência de acionamento inventado.
  // ---------------------------------------------------------------------------
  {
    const roster = parseAimsRoster(`${header('17/08/2026 até17/08/2026')}\n17Aug Mon HSB 06:00 09:00 LA 3730 09:25 10:15 BSB FOR 12:55\n`);
    const days = (roster.days || []).filter((d) => d.date === '17/08/2026');
    const standby = days.find((d) => d.type === 'HSB');
    const flightDay = days.find((d) => (d.legs || []).some((l) => l.flightNumber === 'LA3730'));
    assert.ok(standby, 'o sobreaviso publicado continua presente');
    assert.notEqual(standby.dutyReport, '09:00', 'o horário seguinte (09:00) nunca é promovido a início publicado');
    assert.notEqual(standby.dutyReport, '06:00', 'o primeiro horário ambíguo (06:00) não é inferido como início');
    assert.deepEqual([standby.dutyReport, standby.dutyDebrief, standby.dutyReportSource, standby.dutyDebriefSource], [null, null, 'unknown', 'unknown'], 'janela sem estação ambígua fica não resolvida');
    assert.deepEqual(standby.legs || [], [], 'nenhum acionamento inventado: o voo não é anexado ao sobreaviso');
    assert.match(String(standby.rawText || ''), /HSB 06:00 09:00/, 'o texto original do sobreaviso é preservado');
    assert.ok(flightDay && flightDay !== standby, 'o voo é jornada própria');
    assert.equal(flightDay.dutyReport, '09:25', 'o voo mantém a própria APZ publicada');
    assert.equal(flightDay.dutyReportSource, 'published');
    assert.equal(flightDay.legs.find((l) => l.flightNumber === 'LA3730').departureTime, '10:15');

    const withStations = parseAimsRoster(`${header('17/08/2026 até17/08/2026')}\n17Aug Mon HSB BSB 06:00 BSB 09:00 LA 3730 09:25 10:15 BSB FOR 12:55\n`);
    const publishedStandby = withStations.days.find((d) => d.date === '17/08/2026' && d.type === 'HSB');
    assert.deepEqual([publishedStandby.dutyReport, publishedStandby.dutyDebrief, publishedStandby.dutyReportSource], ['06:00', '09:00', 'published'], 'com estações a janela publicada do sobreaviso é mantida');
    assert.equal(withStations.days.find((d) => (d.legs || []).some((l) => l.flightNumber === 'LA3730')).dutyReport, '09:25');
  }

  // ---------------------------------------------------------------------------
  // 8) Caso legítimo preservado: presentation genuinamente impressa antes do
  // primeiro "LA", SEM continuação "(...)" - a heurística original (para PDFs
  // extraídos no Android/iOS) continua funcionando exatamente como antes.
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('17/08/2026 até17/08/2026')}\n17Aug Mon 09:25 LA 3730 10:15 BSB FOR 12:55\n`;
    const roster = parseAimsRoster(fullText);
    assert.equal(findDay(roster, '17/08/2026')?.dutyReport, '09:25', 'apresentação legitimamente impressa antes do LA (sem "(...)") deve continuar funcionando - regra original preservada');
  }

  // ---------------------------------------------------------------------------
  // Anti-regressão: nenhum padrão perigoso `presentation || reportTime ||
  // checkIn || previous.end` (ou equivalente cru) foi introduzido na função
  // corrigida - a correção usa isLayoverStart, não um fallback genérico.
  // ---------------------------------------------------------------------------
  {
    const source = fs.readFileSync('client/src/lib/aimsParser.ts', 'utf8');
    const fnStart = source.indexOf('function parseFlightDay(lines: string[], homeBase: string, isLayoverStart: boolean): ParsedDay {');
    assert.ok(fnStart >= 0, 'parseFlightDay não encontrada');
    const fnEnd = source.indexOf('\nfunction ', fnStart + 10);
    const fnSource = source.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    assert.doesNotMatch(fnSource, /presentation\s*\|\|.*previous/i, 'não pode haver fallback genérico presentation || previous.*');
    assert.doesNotMatch(fnSource, /reportTime\s*\|\|\s*(?:rest|off|boundary|previous)/i, 'não pode haver fallback genérico reportTime || rest/off/boundary/previous');
    assert.ok(fnSource.includes('!isLayoverStart && !legs.length && !firstReportTime'), 'o guard isLayoverStart deve continuar protegendo a heurística de apresentação-antes-do-LA');
  }

  console.log('[p0-presentation-boundary-leak] OK — LA3730 BSB→FOR mantém presentation=09:25, calculada por proveniência (tokens da própria perna), nunca 08:29 (boundary da atividade anterior, preservado na fonte da própria atividade e, com estações, no seu fim publicado; sem estação a janela ambígua fica não resolvida, sem promover 08:29/09:00 nem inferir 06:00, e o sobreaviso antes do voo fica separado sem acionamento inventado; sem comparação de coincidência de relógio); sem apresentação publicada, o boundary alheio nunca é promovido (fallback pré-existente para departure fica fora do contrato validado aqui); voo após pernoite/descanso/folga preservado; duas pernas na mesma jornada íntegras; ativação HSB/RES não afetada; caso legítimo de apresentação-antes-do-LA sem continuação preservado; nenhum fallback genérico presentation||boundary introduzido.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
