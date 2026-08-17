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
    assert.equal(previousBoundary?.dutyDebrief, '08:29', 'a atividade anterior (HSB) deve preservar seu próprio fim de boundary, 08:29 - sem alteração');
    assert.equal(flightDay?.type, 'VOO');
    assert.equal(flightDay?.dutyReport, '09:25', 'a apresentação canônica do LA3730 deve ser 09:25 - nunca herdar o boundary da atividade anterior');
    assert.equal(leg?.flightNumber, 'LA3730');
    assert.equal(leg?.origin, 'BSB');
    assert.equal(leg?.destination, 'FOR');
    assert.equal(leg?.departureTime, '10:15', 'partida do LA3730 deve permanecer 10:15');
    assert.equal(leg?.arrivalTime, '12:55');
    assert.notEqual(flightDay?.dutyReport, previousBoundary?.dutyDebrief, 'presentation do voo e boundary da atividade anterior nunca podem ser o mesmo valor por coincidência de implementação - são conceitos sempre separados');
  }

  // ---------------------------------------------------------------------------
  // 2) Voo sem apresentação publicada (só decolagem) via "(...)" continuação:
  // não pode herdar o boundary anterior, e não pode inventar - cai no próprio
  // fallback já existente (departure), nunca num horário de outra atividade.
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('16/08/2026 até18/08/2026')}\n16Aug Sun DO\n17Aug Mon (...) 08:29 LA 3730 10:15 BSB FOR 12:55\n18Aug Tue DO\n`;
    const roster = parseAimsRoster(fullText);
    const flightDay = findDay(roster, '17/08/2026');
    assert.equal(flightDay?.dutyReport, '10:15', 'sem apresentação publicada, deve cair no fallback pré-existente (partida do próprio voo) - nunca no boundary 08:29 da folga anterior');
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
  // 7) Atividade RES/HSB acionada (ativação de sobreaviso) não pode ter sua
  // semântica própria quebrada - dutyReport da ativação continua vindo do início
  // do próprio sobreaviso, comportamento pré-existente e intencional, não afetado
  // por este patch (isLayoverStart é sempre false neste caminho de código).
  // ---------------------------------------------------------------------------
  {
    const fullText = `${header('17/08/2026 até17/08/2026')}\n17Aug Mon HSB 06:00 09:00 LA 3730 09:25 10:15 BSB FOR 12:55\n`;
    const roster = parseAimsRoster(fullText);
    const day = findDay(roster, '17/08/2026');
    assert.equal(day?.type, 'HSB');
    assert.equal(day?.dutyReport, '06:00', 'ativação de sobreaviso deve continuar usando o início do próprio sobreaviso como dutyReport - semântica intencional e pré-existente, não tocada por este patch');
    assert.equal(day?.legs?.[0]?.flightNumber, 'LA3730');
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

  console.log('[p0-presentation-boundary-leak] OK — LA3730 BSB→FOR mantém presentation=09:25 (nunca 08:29, o boundary da atividade anterior); boundary anterior preservado na própria atividade; sem apresentação publicada cai no fallback pré-existente (departure), nunca em boundary alheio; voo após pernoite/descanso/folga preservado; duas pernas na mesma jornada íntegras; ativação HSB/RES não afetada; caso legítimo de apresentação-antes-do-LA sem continuação preservado; nenhum fallback genérico presentation||boundary introduzido.');
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
