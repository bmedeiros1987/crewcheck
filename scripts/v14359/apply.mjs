import fs from 'node:fs';

const file = 'client/src/lib/complianceEngine.ts';
if (!fs.existsSync(file)) throw new Error(`[v14.3.59] Arquivo não encontrado: ${file}`);

let source = fs.readFileSync(file, 'utf8');
const marker = "type RegulatoryNightKind = 'worked' | 'standby';";

function replaceRequired(oldValue, newValue, label) {
  if (source.includes(newValue)) return;
  if (!source.includes(oldValue)) throw new Error(`[v14.3.59] Âncora não encontrada: ${label}`);
  source = source.replace(oldValue, newValue);
}

if (!source.includes(marker)) {
  replaceRequired("const COMPLIANCE_ENGINE_VERSION = '13.8.1';", "const COMPLIANCE_ENGINE_VERSION = '13.8.2';", 'versão do motor');

  const oldNightBlock = `function getMadrugadaKeys(days: RosterDay[]): number[] {
  const sorted = sortDays(days);
  const keys: number[] = [];
  let previousDay: RosterDay | null = null;

  for (const day of sorted) {
    if (!hasMadrugadaDuty(day)) {
      previousDay = day;
      continue;
    }

    const date = parseDate(day.date);
    const firstStart = getFirstOperationalStart(day).time;
    const startsBeforeSix = (minutesOfDay(firstStart) ?? 9999) < 6 * 60;
    const sameNightAsPrevious = Boolean(previousDay && hasMadrugadaDuty(previousDay) && previousDay.isNextDay && startsBeforeSix && !isRecoveryDay(previousDay));
    const keyDate = sameNightAsPrevious ? parseDate(previousDay!.date) : date;
    const key = keyDate.getTime();
    if (!keys.includes(key)) keys.push(key);
    previousDay = day;
  }

  return keys.sort((a, b) => a - b);
}

function countNightOpsInRolling168h(days: RosterDay[]): number {
  const nightDates = getMadrugadaKeys(days);
  let max = 0;
  for (let i = 0; i < nightDates.length; i++) {
    const start = nightDates[i];
    const end = start + 168 * 60 * 60 * 1000;
    const count = nightDates.filter(value => value >= start && value <= end).length;
    max = Math.max(max, count);
  }
  return max;
}

function countMaxConsecutiveMadrugadas(days: RosterDay[]): number {
  const keys = getMadrugadaKeys(days);
  if (!keys.length) return 0;
  let current = 1;
  let max = 1;
  for (let i = 1; i < keys.length; i++) {
    const dayGap = Math.round((keys[i] - keys[i - 1]) / (24 * 60 * 60 * 1000));
    if (dayGap === 1) current += 1;
    else current = 1;
    max = Math.max(max, current);
  }
  return max;
}

function hasMadrugadaDuty(day: RosterDay): boolean {
  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) return false;
  const legs = day.legs || [];
  if (legs.length > 0) {
    // Madrugada regulatória por voo: conta somente quando a perna toca 00:00–06:00.
    // Voo sem madrugada continua quebrando a sequência para reduzir falso positivo.
    return legs.some(legTouchesMadrugada);
  }
  if (isStandby(day)) {
    // Regra operacional ajustada: sobreaviso conta para o limite de madrugada
    // quando a janela COMEÇA na madrugada, mesmo sem acionamento. Ele continua
    // não entrando como jornada de voo/trabalho, apenas na métrica de madrugadas.
    const report = minutesOfDay(day.dutyReport);
    return report !== null && report < 6 * 60;
  }
  if (isReserve(day)) return false;
  if (!isActiveDuty(day)) return false;
  const report = minutesOfDay(day.dutyReport);
  const debrief = minutesOfDay(day.dutyDebrief);
  if (report === null || debrief === null) return false;
  // Solo/treinamento/reunião só entram como madrugada quando a atividade inteira é
  // inequivocamente operacional e atravessa a madrugada. Isso fica como exceção.
  return Boolean(day.isNextDay || (report < 6 * 60 && debrief <= 6 * 60));
}`;

  const newNightBlock = `type RegulatoryNightKind = 'worked' | 'standby';

type RegulatoryNightEvent = {
  timestamp: number;
  nightKey: number;
  date: string;
  kind: RegulatoryNightKind;
  source: string;
  segment: number;
};

type OperationalInterval = { start: number; end: number };

type ConsecutiveOperationalWindow = {
  hours: number;
  periods: number;
  startDate: string;
  endDate: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ParsedRosterClock = { minutes: number; offset: number; explicitOffset: boolean };

function parseRosterClock(value: string | null | undefined): ParsedRosterClock | null {
  const match = String(value || '').trim().match(/^(\\d{1,2}):(\\d{2})(?:\\(\\+(\\d+)\\))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const offset = Number(match[3] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { minutes: hours * 60 + minutes, offset, explicitOffset: Boolean(match[3]) };
}

function maxExplicitDayOffset(day: RosterDay): number {
  const text = [
    day.dutyReport,
    day.dutyDebrief,
    day.rawText,
    ...(day.legs || []).flatMap((leg) => [leg.departureTime, leg.arrivalTime]),
  ].filter(Boolean).join(' ');
  return [...text.matchAll(/\\(\\+(\\d+)\\)/g)].reduce((max, match) => Math.max(max, Number(match[1] || 0)), 0);
}

function rosterTimestamp(day: RosterDay, value: string | null | undefined, fallbackOffset = 0): number | null {
  const parsed = parseRosterClock(value);
  if (!parsed) return null;
  const offset = parsed.explicitOffset ? parsed.offset : fallbackOffset;
  return parseDate(day.date).getTime() + offset * DAY_MS + parsed.minutes * 60 * 1000;
}

function getOperationalStartTimestamp(day: RosterDay): number | null {
  const firstLeg = (day.legs || [])[0];
  return rosterTimestamp(day, day.dutyReport || firstLeg?.departureTime, 0);
}

function getOperationalEndTimestamp(day: RosterDay): number | null {
  const legs = day.legs || [];
  const lastLeg = legs[legs.length - 1];
  const endValue = day.dutyDebrief || lastLeg?.arrivalTime;
  const parsedEnd = parseRosterClock(endValue);
  if (!parsedEnd) return null;
  const start = getOperationalStartTimestamp(day);
  const inferredOffset = Math.max(day.isNextDay ? 1 : 0, maxExplicitDayOffset(day));
  let end = rosterTimestamp(day, endValue, inferredOffset);
  if (end !== null && start !== null && end <= start) end += DAY_MS;
  return end;
}

function getRecoveryStartTimestamp(day: RosterDay): number {
  return rosterTimestamp(day, day.dutyReport, 0) ?? parseDate(day.date).getTime();
}

function analyzeConsecutiveOperationalWindow(days: RosterDay[]): ConsecutiveOperationalWindow {
  let sequenceStart: number | null = null;
  let sequenceStartDate = '';
  let lastOperationalEnd: number | null = null;
  let best: ConsecutiveOperationalWindow = { hours: 0, periods: 0, startDate: '', endDate: '' };

  const closeWindow = (boundary: number | null, boundaryDate: string) => {
    if (sequenceStart === null || boundary === null || boundary <= sequenceStart) return;
    const hours = (boundary - sequenceStart) / HOUR_MS;
    if (hours > best.hours) {
      best = {
        hours: round1(hours),
        periods: Math.ceil(hours / 24),
        startDate: sequenceStartDate,
        endDate: boundaryDate,
      };
    }
  };

  for (const day of sortDays(days)) {
    if (isRecoveryDay(day)) {
      closeWindow(getRecoveryStartTimestamp(day), day.date);
      sequenceStart = null;
      sequenceStartDate = '';
      lastOperationalEnd = null;
      continue;
    }

    // Dia realmente em branco não é folga e não é atividade. Ele não incrementa a
    // sequência por quantidade de registros, mas o tempo civil continua correndo até
    // a próxima folga formal publicada.
    if (isEmptyCalendarDay(day) || isNonOperationalAbsence(day) || !isActiveDuty(day)) continue;

    const start = getOperationalStartTimestamp(day);
    const end = getOperationalEndTimestamp(day) ?? start;
    if (start === null) continue;
    if (sequenceStart === null) {
      sequenceStart = start;
      sequenceStartDate = day.date;
    }
    if (end !== null) lastOperationalEnd = Math.max(lastOperationalEnd ?? end, end);
  }

  closeWindow(lastOperationalEnd, lastOperationalEnd ? formatDate(new Date(lastOperationalEnd)) : '');
  return best;
}

function nightEventsForInterval(start: number, end: number, date: string, kind: RegulatoryNightKind, source: string): RegulatoryNightEvent[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const events: RegulatoryNightEvent[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  for (let nightKey = cursor.getTime(); nightKey < end; nightKey += DAY_MS) {
    const windowStart = nightKey;
    const windowEnd = nightKey + 6 * HOUR_MS;
    if (start < windowEnd && end > windowStart) {
      events.push({ timestamp: Math.max(start, windowStart), nightKey, date, kind, source, segment: 0 });
    }
  }
  return events;
}

function getLegOperationalIntervals(day: RosterDay): OperationalInterval[] {
  const intervals: OperationalInterval[] = [];
  let inferredOffset = 0;
  let previousDepartureMinutes: number | null = null;

  for (const leg of day.legs || []) {
    const departure = parseRosterClock(leg.departureTime);
    const arrival = parseRosterClock(leg.arrivalTime);
    if (!departure || !arrival) continue;

    if (!departure.explicitOffset && previousDepartureMinutes !== null && departure.minutes < previousDepartureMinutes) inferredOffset += 1;
    const departureOffset = departure.explicitOffset ? departure.offset : inferredOffset;
    let arrivalOffset = arrival.explicitOffset ? arrival.offset : departureOffset;
    if (!arrival.explicitOffset && (arrival.minutes <= departure.minutes || leg.isNextDay)) arrivalOffset += 1;

    const base = parseDate(day.date).getTime();
    const start = base + departureOffset * DAY_MS + departure.minutes * 60 * 1000;
    const end = base + arrivalOffset * DAY_MS + arrival.minutes * 60 * 1000;
    if (end > start) intervals.push({ start, end });

    inferredOffset = Math.max(inferredOffset, departureOffset, arrivalOffset);
    previousDepartureMinutes = departure.minutes;
  }

  return intervals;
}

function getRegulatoryNightEventsForDay(day: RosterDay): RegulatoryNightEvent[] {
  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) return [];

  const legIntervals = getLegOperationalIntervals(day);
  if (legIntervals.length) {
    return legIntervals.flatMap((interval, index) => nightEventsForInterval(interval.start, interval.end, day.date, 'worked', `voo ${index + 1}`));
  }

  const start = getOperationalStartTimestamp(day);
  const end = getOperationalEndTimestamp(day);
  if (start === null || end === null) return [];
  if (isStandby(day)) return nightEventsForInterval(start, end, day.date, 'standby', 'HSB/HSBE');
  if (isReserve(day) || !isActiveDuty(day)) return [];
  return nightEventsForInterval(start, end, day.date, 'worked', 'atividade operacional');
}

function mergeOperationalIntervals(days: RosterDay[]): OperationalInterval[] {
  const intervals = sortDays(days).flatMap((day) => {
    if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) return [];
    if (!isActiveDuty(day) && !isStandby(day) && !isReserve(day)) return [];
    const start = getOperationalStartTimestamp(day);
    const end = getOperationalEndTimestamp(day);
    return start !== null && end !== null && end > start ? [{ start, end }] : [];
  }).sort((a, b) => a.start - b.start);

  const merged: OperationalInterval[] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) merged.push({ ...interval });
    else previous.end = Math.max(previous.end, interval.end);
  }
  return merged;
}

function getRegulatoryNightEvents(days: RosterDay[], resetAfterFreeHours = 48): RegulatoryNightEvent[] {
  const preferredByNight = new Map<number, RegulatoryNightEvent>();
  for (const event of sortDays(days).flatMap(getRegulatoryNightEventsForDay)) {
    const previous = preferredByNight.get(event.nightKey);
    if (!previous || (previous.kind === 'standby' && event.kind === 'worked')) preferredByNight.set(event.nightKey, event);
  }

  const events = [...preferredByNight.values()].sort((a, b) => a.timestamp - b.timestamp);
  const intervals = mergeOperationalIntervals(days);
  const resetBoundaries: number[] = [];
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index].start - intervals[index - 1].end >= resetAfterFreeHours * HOUR_MS) resetBoundaries.push(intervals[index].start);
  }

  return events.map((event) => ({
    ...event,
    segment: resetBoundaries.filter((boundary) => event.timestamp >= boundary).length,
  }));
}

function maxEventsInRolling168h(events: RegulatoryNightEvent[]): number {
  let max = 0;
  for (const startEvent of events) {
    const end = startEvent.timestamp + 168 * HOUR_MS;
    const count = events.filter((candidate) => candidate.segment === startEvent.segment && candidate.timestamp >= startEvent.timestamp && candidate.timestamp < end).length;
    max = Math.max(max, count);
  }
  return max;
}

function maxConsecutiveWorkedNights(events: RegulatoryNightEvent[]): number {
  const worked = events.filter((event) => event.kind === 'worked').sort((a, b) => a.nightKey - b.nightKey);
  if (!worked.length) return 0;
  let current = 1;
  let max = 1;
  for (let index = 1; index < worked.length; index += 1) {
    const sameSegment = worked[index].segment === worked[index - 1].segment;
    const gap = Math.round((worked[index].nightKey - worked[index - 1].nightKey) / DAY_MS);
    current = sameSegment && gap === 1 ? current + 1 : 1;
    max = Math.max(max, current);
  }
  return max;
}

function summarizeRegulatoryNightEvents(days: RosterDay[], resetAfterFreeHours = 48) {
  const events = getRegulatoryNightEvents(days, resetAfterFreeHours);
  const workedEvents = events.filter((event) => event.kind === 'worked');
  const standbyEvents = events.filter((event) => event.kind === 'standby');
  return {
    events,
    workedEvents,
    standbyEvents,
    maxWorkedIn168h: maxEventsInRolling168h(workedEvents),
    maxCombinedIn168h: maxEventsInRolling168h(events),
    maxConsecutiveWorked: maxConsecutiveWorkedNights(events),
  };
}

function hasMadrugadaDuty(day: RosterDay): boolean {
  return getRegulatoryNightEventsForDay(day).some((event) => event.kind === 'worked');
}`;

  replaceRequired(oldNightBlock, newNightBlock, 'motor de madrugadas');

  replaceRequired(
    `  let restTotal = 0;\n  let restCount = 0;\n  let consecutiveWorkPeriods = 0;`,
    `  let restTotal = 0;\n  let restCount = 0;\n\n  const consecutiveWindow = analyzeConsecutiveOperationalWindow(sortedDays);\n  if (consecutiveWindow.hours > limits.maxConsecutiveWorkPeriods * 24) {\n    pushAlert(alerts, {\n      severity: 'warning',\n      title: 'Mais de 6 períodos de 24h sem folga formal — revisar',\n      description: \`${'${consecutiveWindow.startDate} a ${consecutiveWindow.endDate}: ${consecutiveWindow.hours.toFixed(1)}h entre a primeira apresentação e o início da recuperação publicada.'}\`,\n      details: 'O cálculo usa tempo civil real desde a primeira apresentação. Múltiplas atividades no mesmo dia, MCK e continuidades (+1/+2/+3) não são contadas como novos períodos. Dias realmente em branco não viram atividade nem folga.',\n      legalReference: 'RBAC 117, Apêndice A, A117.25(a)',\n      date: consecutiveWindow.endDate,\n      confidence: 'media',\n      classification: 'atencao',\n      evidence: \`${'${consecutiveWindow.periods} período(s) civil(is) estimado(s); limite automático: ${limits.maxConsecutiveWorkPeriods}.'}\`,\n    });\n  }`,
    'estado da sequência operacional',
  );

  const oldConsecutiveBlock = `    if (isFormalDayOff(day)) {
      metrics.totalDaysOff += 1;
      metrics.daysOff += 1;
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isRestExtension(day) || isLayoverOrInactive(day)) {
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isActiveDuty(day)) {
      consecutiveWorkPeriods += 1;
      if (consecutiveWorkPeriods > limits.maxConsecutiveWorkPeriods) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Mais de 6 atividades consecutivas sem folga formal — revisar',
          description: \`${'${day.date}: identificados ${consecutiveWorkPeriods} períodos consecutivos de atividade sem folga periódica.'}\`,
          details: 'O sistema agora conta apenas atividades efetivas; DOP/DOPR/DO/DR/DOF/VC contam como folga formal; OFF e inativo/pernoite interrompem a sequência operacional, mas não entram como folga formal mensal.',
          legalReference: 'RBAC 117, Apêndice A, A117.25(a)',
          date: day.date,
        });
      }
    }`;
  const newConsecutiveBlock = `    if (isFormalDayOff(day)) {
      metrics.totalDaysOff += 1;
      metrics.daysOff += 1;
      metrics.restDays += 1;
    } else if (isRestExtension(day) || isLayoverOrInactive(day)) {
      metrics.restDays += 1;
    }`;
  replaceRequired(oldConsecutiveBlock, newConsecutiveBlock, 'contador por quantidade de objetos');

  replaceRequired(`    const hasMadrugada = hasMadrugadaDuty(day);\n`, '', 'variável de madrugada por objeto');
  replaceRequired(`\n    if (hasMadrugada) metrics.nightOperations += 1;\n`, '\n', 'contador de madrugada por objeto');

  replaceRequired(
    `  metrics.maxConsecutiveNights = countMaxConsecutiveMadrugadas(sortedDays);\n  const maxNightOpsWindow = countNightOpsInRolling168h(sortedDays);`,
    `  const nightSummary = summarizeRegulatoryNightEvents(sortedDays, actRules.nightOps.resetAfterFreeHours);\n  metrics.nightOperations = nightSummary.workedEvents.length;\n  metrics.maxConsecutiveNights = nightSummary.maxConsecutiveWorked;\n  const maxNightOpsWindow = nightSummary.maxWorkedIn168h;`,
    'resumo de madrugadas',
  );

  replaceRequired(
    `  if (maxNightOpsWindow > limits.maxNightOps168h) {`,
    `  if (nightSummary.maxCombinedIn168h > limits.maxNightOps168h && maxNightOpsWindow <= limits.maxNightOps168h && nightSummary.standbyEvents.length > 0) {\n    pushAlert(alerts, {\n      severity: 'warning',\n      title: 'HSB iniciado na madrugada dentro da janela — confirmar regra do ACT',\n      description: \`${'${nightSummary.standbyEvents.length} HSB/HSBE iniciado(s) entre 00:00 e 06:00 e ${nightSummary.workedEvents.length} madrugada(s) efetivamente trabalhada(s) foram identificados.'}\`,\n      details: 'O CrewCheck separa disponibilidade em HSB de madrugada efetivamente trabalhada. Este item é apenas contexto e não confirma extrapolação do limite de trabalho.',\n      legalReference: actRules.nightOps.legalReference,\n      confidence: 'media',\n      classification: 'atencao',\n    });\n  }\n\n  if (maxNightOpsWindow > limits.maxNightOps168h) {`,
    'contexto HSB separado',
  );

  replaceRequired(
    `      title: 'Madrugadas em 168h — revisar janela real',\n      description: \`Até ${'${maxNightOpsWindow}'} madrugada(s) em janela móvel de 168h. Revise a sequência real no PDF.\`,\n      details: 'O sistema conta voo que toca 00:00–06:00 e sobreaviso que começa na madrugada; folga, reserva sem voo e voo sem madrugada quebram sequência. Mantido como atenção para evitar falso positivo.',`,
    `      title: 'Madrugadas trabalhadas em 168h — revisar janela real',\n      description: \`Até ${'${maxNightOpsWindow}'} madrugada(s) efetivamente trabalhada(s) em janela móvel de 168h.\`,\n      details: \`A janela usa o horário real em que cada atividade toca 00:00–06:00, é semiaberta (não duplica o limite exato de 168h) e reinicia após ${'${actRules.nightOps.resetAfterFreeHours}'}h livres. HSB sem acionamento é exibido separadamente e não entra nesta soma.\`,`,
    'texto da janela de 168h',
  );

  replaceRequired(
    `      title: 'Madrugadas consecutivas — revisar sequência real',\n      description: \`${'${metrics.maxConsecutiveNights}'} madrugada(s) consecutiva(s) detectada(s). Revise se houve folga, inativo ou pernoite quebrando a sequência.\`,\n      details: 'Folga, pernoite/inativo, reserva sem voo e voo sem madrugada quebram a sequência; sobreaviso só conta quando começa na madrugada.',`,
    `      title: 'Madrugadas trabalhadas consecutivas — revisar sequência real',\n      description: \`${'${metrics.maxConsecutiveNights}'} madrugada(s) efetivamente trabalhada(s) e consecutiva(s) detectada(s).\`,\n      details: \`A sequência usa a data real da madrugada tocada pelo voo/atividade, reinicia após ${'${actRules.nightOps.resetAfterFreeHours}'}h livres e não transforma HSB sem acionamento em madrugada trabalhada.\`,`,
    'texto de madrugadas consecutivas',
  );
}

if (!source.includes(marker)) throw new Error('[v14.3.59] Motor regulatório temporal não foi aplicado.');
if (source.includes('let consecutiveWorkPeriods = 0;')) throw new Error('[v14.3.59] Contador antigo por quantidade de objetos permaneceu ativo.');
if (source.includes('function getMadrugadaKeys(')) throw new Error('[v14.3.59] Chaves antigas por meia-noite permaneceram ativas.');

fs.writeFileSync(file, source, 'utf8');
console.log('[crewcheck:prepare] v14.3.59 alertas regulatórios por tempo real aplicados.');
