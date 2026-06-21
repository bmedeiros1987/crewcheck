import type { CrewRoster, FlightLeg, RosterDay } from './pdfParser';
import { findRosterCodes, getRosterCodeDefinition } from './rosterCodes';

const MERGEABLE_ACTIVITY_RE = /^(C\d{2,3}F|CRM|CBF|EMER|MT)$/i;
const STANDBY_RE = /^(HSBE|HSB|ASB|RES)$/i;

export function normalizeRosterSchedule(roster: CrewRoster): CrewRoster {
  const clonedDays = (roster.days || [])
    .filter(Boolean)
    .map(cloneDay)
    .filter((day) => Boolean(day.date));

  // Corrige atividades EAD que o PDF/AIMS pode entregar como CRM genérico.
  // Ex.: em 02/06 aparecem dois blocos sequenciais 09:00-11:00 e 11:00-13:00;
  // no Crew Lounge Connect eles são CBF e EMER, não CRM.
  const trainingCodesFixed = fixLatamEadTrainingCodes(clonedDays);
  const mergedFlights = mergeFlightRowsByDuty(trainingCodesFixed);
  const withoutAllDayDuplicates = dropAllDayDuplicates(mergedFlights);
  const withoutEmptyDuplicates = withoutAllDayDuplicates.filter((day, _index, all) => {
    if (!isEmptyDay(day)) return true;
    return !all.some((other) => other !== day && other.date === day.date && !isEmptyDay(other));
  });
  const activitiesMergedIntoFlights = mergeActivityRowsIntoFlights(withoutEmptyDuplicates);
  const mergedTimedActivities = mergeTimedActivityRows(activitiesMergedIntoFlights);
  const dedupedDays = dropDisplayDuplicates(dropAllDayDuplicates(mergedTimedActivities));
  const flightWindowsFixed = normalizeSuspiciousFlightWindows(dedupedDays);
  const finalDays = fixUnreadReserveStandbyEnd(stabilizeSameDaySequentialWindows(flightWindowsFixed)).sort(compareRosterDays);

  return { ...roster, days: finalDays };
}

function fixUnreadReserveStandbyEnd(days: RosterDay[]): RosterDay[] {
  const clonedDays = days.map(cloneDay);
  const byDate = groupBy(clonedDays, (day) => day.date);

  for (const group of byDate.values()) {
    const sorted = group.sort(compareRosterDays);
    for (let index = 0; index < sorted.length; index++) {
      const day = sorted[index];
      const code = primaryComparableCode(day);
      if (!STANDBY_RE.test(code)) continue;

      const ownStart = extractOwnActivityStartFromRawText(day.rawText || '', code);
      if (ownStart && cleanTime(day.dutyReport || '') !== ownStart) {
        day.dutyReport = ownStart;
        // Se o fim era igual ao início contaminado ou veio de outro bloco, recalcula abaixo.
        const ownEnd = extractReliableEndFromRawText(day.rawText || '', ownStart, code);
        day.dutyDebrief = ownEnd || null;
        day.rawText = joinRaw(day.rawText, 'CrewCheck: início da reserva/sobreaviso corrigido pelo bloco correto do código, sem herdar HSB/ASB vizinho.');
      }

      if (!day.dutyReport) continue;

      const currentEndIsUnsafe = !day.dutyDebrief || cleanTime(day.dutyDebrief) === cleanTime(day.dutyReport);
      if (!currentEndIsUnsafe) continue;

      const inferredEnd = inferStandbyReserveEnd(day, sorted, index);
      if (!inferredEnd) {
        day.dutyDebrief = null;
        day.dutyHours = null;
        day.rawText = joinRaw(day.rawText, 'CrewCheck: fim de reserva/sobreaviso não exibido por leitura insegura do PDF.');
        continue;
      }

      day.dutyDebrief = inferredEnd.time;
      day.isNextDay = inferredEnd.nextDay;
      day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
      day.rawText = joinRaw(day.rawText, inferredEnd.reason);
    }
  }

  return clonedDays;
}

function inferStandbyReserveEnd(day: RosterDay, sameDaySorted: RosterDay[], index: number): { time: string; nextDay: boolean; reason: string } | null {
  const code = primaryComparableCode(day);
  const start = cleanTime(day.dutyReport || '');
  if (!start) return null;
  const startMinutes = timeToMinutes(start);

  const rawEnd = extractReliableEndFromRawText(day.rawText || '', start, code);
  if (rawEnd) return { time: rawEnd, nextDay: timeToMinutes(rawEnd) <= startMinutes, reason: 'CrewCheck: fim de reserva/sobreaviso recuperado no bloco correto do código, sem misturar HSB com ASB.' };

  const nextStart = sameDaySorted
    .slice(index + 1)
    .map((candidate) => cleanTime(candidate.dutyReport || ''))
    .filter(Boolean)
    .map((time) => ({ time, minutes: timeToMinutes(time) }))
    .find((candidate) => candidate.minutes > startMinutes + 10 && candidate.minutes - startMinutes <= 12 * 60);

  if (nextStart && (code === 'HSB' || code === 'HSBE')) {
    return { time: nextStart.time, nextDay: false, reason: 'CrewCheck: fim do sobreaviso inferido pelo início da próxima programação no mesmo dia.' };
  }

  // ASB/RES não deve encerrar pelo início de outra programação do mesmo dia.
  // Quando HSB e ASB aparecem juntos, usar o próximo card como fim da reserva derruba
  // a janela de jantar e gera diária errada. Reserva sem fim legível usa 6h padrão.
  if (code === 'ASB' || code === 'RES') {
    const standardEnd = inferAirportReserveEnd(start);
    return { time: standardEnd.time, nextDay: standardEnd.nextDay, reason: standardEnd.reason };
  }

  if (code === 'HSBE') {
    const end = minutesToTime(startMinutes + 3 * 60);
    return { time: end, nextDay: timeToMinutes(end) <= startMinutes, reason: 'CrewCheck: fim do HSBE estimado por janela operacional de 3h quando o PDF não trouxe o fim legível.' };
  }

  return null;
}

function extractOwnActivityStartFromRawText(rawText: string, code: string): string | null {
  const scoped = activitySegmentFromRawText(rawText, code);
  if (!scoped) return null;
  return Array.from(String(scoped).matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)).map((match) => cleanTime(match[0]))[0] || null;
}

function extractReliableEndFromRawText(rawText: string, start: string, code = ''): string | null {
  const scoped = activitySegmentFromRawText(rawText, code) || rawText;
  const times = Array.from(new Set(Array.from(String(scoped || '').matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)).map((match) => cleanTime(match[0]))));
  if (times.length < 2) return null;
  const startMinutes = timeToMinutes(start);
  const candidates = times
    .filter((time) => time !== start)
    .map((time) => ({ time, diff: normalizeEnd(startMinutes, timeToMinutes(time)) - startMinutes }))
    .filter((candidate) => candidate.diff >= 30 && candidate.diff <= 12 * 60)
    .sort((a, b) => b.diff - a.diff);
  return candidates[0]?.time || null;
}

function activitySegmentFromRawText(rawText: string, code: string): string | null {
  const normalizedCode = String(code || '').toUpperCase();
  if (!normalizedCode) return null;
  const raw = String(rawText || '');
  const upper = raw.toUpperCase();
  const idx = upper.search(new RegExp(`\\b${normalizedCode}\\b`));
  if (idx < 0) return null;
  const next = findNextActivityBoundary(upper, idx + normalizedCode.length);
  return raw.slice(idx, next > idx ? next : Math.min(raw.length, idx + 220));
}

function findNextActivityBoundary(text: string, fromIndex: number): number {
  const re = /\b(HSBE|HSB|ASB|RES|CBF|EMER|CRMBSB|CRMB|CRM|MT|C\d{2,3}F|DOF?|DOPR?|DR|OFF|VC|LA\s?\d{3,4})\b/g;
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? match.index : -1;
}

function inferAirportReserveEnd(start: string): { time: string; nextDay: boolean; reason: string } {
  const startMinutes = timeToMinutes(start);
  const elevenPm = timeToMinutes('23:00');
  // Na escala LATAM observada, a reserva ASB vespertina publicada às 17:10 encerra às 23:00.
  // Esse ajuste evita janela zero e preserva o limite operacional de até 6h.
  if (startMinutes >= timeToMinutes('16:00') && startMinutes <= timeToMinutes('18:30')) {
    return { time: '23:00', nextDay: false, reason: 'CrewCheck: fim da reserva ASB ajustado para 23:00 quando o PDF não trouxe o fim legível.' };
  }
  const endMinutes = startMinutes + 6 * 60;
  if (endMinutes <= elevenPm || startMinutes < timeToMinutes('12:00')) {
    const end = minutesToTime(endMinutes);
    return { time: end, nextDay: endMinutes >= 1440, reason: 'CrewCheck: fim da reserva ASB estimado por janela operacional máxima de 6h quando o PDF não trouxe o fim legível.' };
  }
  return { time: '23:00', nextDay: false, reason: 'CrewCheck: fim da reserva ASB limitado às 23:00 quando o PDF não trouxe o fim legível.' };
}

function cloneDay(day: RosterDay): RosterDay {
  return {
    ...day,
    legs: (day.legs || []).map((leg) => ({ ...leg })),
    rawText: day.rawText || '',
  };
}

function fixLatamEadTrainingCodes(days: RosterDay[]): RosterDay[] {
  const output = days.map((day) => {
    const cloned = cloneDay(day);
    const inferred = inferLatamEadCode(cloned);
    if (inferred) applyLatamEadCode(cloned, inferred);
    return cloned;
  });

  const byDate = groupBy(output, (day) => day.date);
  for (const group of byDate.values()) {
    const genericTraining = group
      .filter((day) => !isFlightDay(day))
      .filter((day) => isGenericTraining(day))
      .filter((day) => day.dutyReport && day.dutyDebrief)
      .sort(compareRosterDays);

    if (genericTraining.length < 2) continue;

    for (let i = 0; i < genericTraining.length - 1; i++) {
      const first = genericTraining[i];
      const second = genericTraining[i + 1];
      if (primaryActivityCode(first) !== 'CRM' || primaryActivityCode(second) !== 'CRM') continue;
      if (!looksLikeLatamEadPair(first, second)) continue;

      applyLatamEadCode(first, 'CBF');
      applyLatamEadCode(second, 'EMER');
      i += 1;
    }
  }

  return output;
}

function inferLatamEadCode(day: RosterDay): 'CBF' | 'EMER' | null {
  const text = `${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`.toUpperCase();
  if (/\bCBF\b|COMBATE\s+AO\s+FOGO|FOGO/.test(text)) return 'CBF';
  if (/\bEMER\b|EMERG[ÊE]NCIAS?\s+GERAIS|EMERGENC/.test(text)) return 'EMER';
  return null;
}

function applyLatamEadCode(day: RosterDay, code: 'CBF' | 'EMER'): void {
  day.type = 'CRM';
  day.pairingCode = code;
  const label = code === 'CBF' ? 'EAD - Combate ao Fogo' : 'EAD - Emergências Gerais';
  day.rawText = joinRaw(day.rawText, `${code} ${label}`);
}

function isGenericTraining(day: RosterDay): boolean {
  const code = primaryActivityCode(day);
  const raw = String(day.rawText || '').toUpperCase();
  return (day.type === 'CRM' || code === 'CRM' || /\bCRMB?\b/.test(raw))
    && !/\b(CBF|EMER|C\d{2,3}F|MT)\b|COMBATE\s+AO\s+FOGO|EMERG[ÊE]NCIAS?/.test(raw)
    && !(day.pairingCode && day.pairingCode !== 'CRM');
}

function looksLikeLatamEadPair(first: RosterDay, second: RosterDay): boolean {
  if (first.date !== second.date) return false;
  if (!first.dutyReport || !first.dutyDebrief || !second.dutyReport || !second.dutyDebrief) return false;
  const firstDuration = diffHours(first.dutyReport, first.dutyDebrief);
  const secondDuration = diffHours(second.dutyReport, second.dutyDebrief);
  const touchGap = minutesBetween(first.dutyDebrief, second.dutyReport);
  const startsAtKnownWindow = timeToMinutes(first.dutyReport) >= timeToMinutes('08:00') && timeToMinutes(first.dutyReport) <= timeToMinutes('10:00');
  const secondFollows = timeToMinutes(second.dutyReport) >= timeToMinutes('10:30') && timeToMinutes(second.dutyReport) <= timeToMinutes('12:00');
  return firstDuration >= 1.5 && firstDuration <= 2.5
    && secondDuration >= 1.5 && secondDuration <= 2.5
    && touchGap >= -5 && touchGap <= 20
    && startsAtKnownWindow
    && secondFollows;
}


function stabilizeSameDaySequentialWindows(days: RosterDay[]): RosterDay[] {
  const output: RosterDay[] = [];
  const byDate = groupBy(days.map(cloneDay), (day) => day.date);

  for (const group of byDate.values()) {
    const sorted = group.sort(compareRosterDays);
    let previousEnd: number | null = null;

    for (const day of sorted) {
      if (!day.dutyReport || !day.dutyDebrief) {
        output.push(day);
        continue;
      }

      const start = timeToMinutes(day.dutyReport);
      const end = normalizeEnd(start, timeToMinutes(day.dutyDebrief));

      // Evita falso positivo quando duas programacoes no mesmo dia encostam
      // ou quando o PDF/AIMS entrega o fim da primeira como inicio da segunda.
      // Ex.: CBF 09:00-11:00 + EMER 11:00-13:00 => EMER 11:01-13:00.
      // Nao alteramos voos, porque horario de voo deve permanecer fiel a escala.
      if (!isFlightDay(day) && previousEnd !== null) {
        const overlapOrTouch = start <= previousEnd;
        const smallParserCollision = previousEnd - start >= 0 && previousEnd - start <= 20;
        if (overlapOrTouch && smallParserCollision) {
          const newStartMinutes = previousEnd + 1;
          day.dutyReport = minutesToTime(newStartMinutes);
          const normalizedEnd = end <= newStartMinutes ? newStartMinutes + Math.max(30, end - start || 60) : end;
          day.dutyDebrief = minutesToTime(normalizedEnd);
          day.isNextDay = false;
          day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, false));
          day.rawText = joinRaw(day.rawText, `CrewCheck: horario ajustado em +1min para manter programacoes do mesmo dia sem sobreposicao visual.`);
        }
      }

      const finalStart = timeToMinutes(day.dutyReport);
      const finalEnd = normalizeEnd(finalStart, timeToMinutes(day.dutyDebrief));
      previousEnd = previousEnd === null ? finalEnd : Math.max(previousEnd, finalEnd);
      output.push(day);
    }
  }

  return output;
}

function dropDisplayDuplicates(days: RosterDay[]): RosterDay[] {
  const seen = new Set<string>();
  const output: RosterDay[] = [];
  for (const day of days.sort(compareRosterDays)) {
    const key = [
      day.date,
      primaryComparableCode(day),
      day.dutyReport || 'ALLDAY',
      day.dutyDebrief || 'ALLDAY',
      normalizeComparableRaw(day.rawText || ''),
      legSignature(day),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(day);
  }
  return output;
}

function normalizeComparableRaw(value: string): string {
  return value.toUpperCase().replace(/\s+/g, ' ').trim();
}

function mergeFlightRowsByDuty(days: RosterDay[]): RosterDay[] {
  const output: RosterDay[] = [];
  const byDate = groupBy(days, (day) => day.date);

  for (const group of byDate.values()) {
    const flights = group.filter(isFlightDay).sort(compareRosterDays);
    const nonFlights = group.filter((day) => !isFlightDay(day));
    const consumed = new Set<RosterDay>();

    for (const flight of flights) {
      if (consumed.has(flight)) continue;
      const merged = cloneDay(flight);
      consumed.add(flight);

      for (const candidate of flights) {
        if (consumed.has(candidate)) continue;
        if (shouldMergeFlightDays(merged, candidate)) {
          merged.legs = dedupeLegs([...merged.legs, ...(candidate.legs || [])]).sort(compareLegs);
          merged.dutyReport = minTime(merged.dutyReport, candidate.dutyReport) || merged.dutyReport || candidate.dutyReport;
          merged.dutyDebrief = maxTime(merged.dutyReport, merged.dutyDebrief, candidate.dutyDebrief) || merged.dutyDebrief || candidate.dutyDebrief;
          merged.rawText = joinRaw(merged.rawText, candidate.rawText);
          merged.pairingCode = merged.pairingCode || candidate.pairingCode;
          merged.isNextDay = Boolean(merged.isNextDay || candidate.isNextDay);
          recomputeFlightTotals(merged);
          consumed.add(candidate);
        }
      }
      output.push(merged);
    }

    output.push(...nonFlights);
  }

  return output;
}

function shouldMergeFlightDays(a: RosterDay, b: RosterDay): boolean {
  if (a.date !== b.date) return false;
  const aLast = a.legs?.[a.legs.length - 1];
  const bFirst = b.legs?.[0];
  if (!aLast || !bFirst) return false;
  const sameChain = aLast.destination === bFirst.origin;
  const gap = minutesBetween(aLast.arrivalTime, bFirst.departureTime);
  const dutyGap = a.dutyDebrief && b.dutyReport ? minutesBetween(a.dutyDebrief, b.dutyReport) : gap;
  return sameChain || (gap >= 0 && gap <= 180) || (dutyGap >= -30 && dutyGap <= 180);
}

function mergeActivityRowsIntoFlights(days: RosterDay[]): RosterDay[] {
  const output: RosterDay[] = [];
  const byDate = groupBy(days, (day) => day.date);

  for (const group of byDate.values()) {
    const flights = group.filter(isFlightDay).sort(compareRosterDays);
    const others = group.filter((day) => !isFlightDay(day));
    const consumed = new Set<RosterDay>();

    for (const flight of flights) {
      const flightActivityCodes = getActivityCodes(flight);
      for (const activity of others) {
        if (consumed.has(activity) || !isMergeableActivity(activity)) continue;
        const activityCode = primaryActivityCode(activity);
        if (!activityCode) continue;
        // C32F/check A32F deve ficar separado do voo. Mesclar o check na janela
        // do voo gerava jornadas visuais enormes (ex.: 22h) quando havia voo após check.
        if (/^C\d{2,3}F$/i.test(activityCode)) continue;
        const mentionedInFlight = flightActivityCodes.includes(activityCode);
        const overlaps = windowsOverlapOrTouch(activity, flight, 180);
        if (mentionedInFlight || overlaps) {
          flight.rawText = joinRaw(flight.rawText, activity.rawText || activityCode);
          flight.dutyReport = minTime(flight.dutyReport, activity.dutyReport) || flight.dutyReport || activity.dutyReport;
          flight.dutyDebrief = maxTime(flight.dutyReport, flight.dutyDebrief, activity.dutyDebrief) || flight.dutyDebrief || activity.dutyDebrief;
          if (!flight.pairingCode || /^LA\d{3,4}$/i.test(flight.pairingCode)) {
            flight.pairingCode = activityCode;
          }
          recomputeFlightTotals(flight);
          consumed.add(activity);
        }
      }
      output.push(flight);
    }

    for (const day of others) {
      if (!consumed.has(day)) output.push(day);
    }
  }

  return output;
}

function normalizeSuspiciousFlightWindows(days: RosterDay[]): RosterDay[] {
  return days.map((day) => {
    const cloned = cloneDay(day);
    if (!isFlightDay(cloned) || !cloned.legs.length) return cloned;

    const first = cloned.legs[0];
    const last = cloned.legs[cloned.legs.length - 1];
    const hasCheckOrTrainingInText = /\b(C\d{2,3}F|CRM|CBF|EMER)\b/i.test(`${cloned.pairingCode || ''} ${cloned.rawText || ''}`);
    const dutyHours = cloned.dutyReport && cloned.dutyDebrief ? diffHours(cloned.dutyReport, cloned.dutyDebrief, Boolean(cloned.isNextDay)) : null;
    const reportToFirstDeparture = cloned.dutyReport ? minutesBetween(cloned.dutyReport, first.departureTime) : 0;
    const clearlyMergedWithTraining = hasCheckOrTrainingInText && (
      (typeof dutyHours === 'number' && dutyHours > 16) ||
      reportToFirstDeparture > 360 ||
      reportToFirstDeparture < -720
    );

    if (clearlyMergedWithTraining) {
      cloned.dutyReport = first.departureTime;
      cloned.dutyDebrief = last.arrivalTime;
      cloned.isNextDay = Boolean(cloned.legs.some((leg) => leg.isNextDay) || timeToMinutes(last.arrivalTime) < timeToMinutes(first.departureTime));
      cloned.dutyHours = round2(diffHours(cloned.dutyReport, cloned.dutyDebrief, cloned.isNextDay));
      cloned.flyingHours = round2(cloned.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, Boolean(leg.isNextDay))), 0));
      cloned.rawText = joinRaw(cloned.rawText, 'CrewCheck: voo pós-check exibido com janela própria do voo para evitar jornada visual falsa.');
    }
    return cloned;
  });
}

function mergeTimedActivityRows(days: RosterDay[]): RosterDay[] {
  const output: RosterDay[] = [];
  const byKey = groupBy(days.filter((day) => !isFlightDay(day)), (day) => `${day.date}|${primaryComparableCode(day)}`);
  const handled = new Set<RosterDay>();

  for (const group of byKey.values()) {
    const code = primaryComparableCode(group[0]);
    if (!code || !(MERGEABLE_ACTIVITY_RE.test(code) || STANDBY_RE.test(code))) continue;
    const timed = group.filter((day) => day.dutyReport && day.dutyDebrief).sort(compareRosterDays);
    const untimed = group.filter((day) => !day.dutyReport || !day.dutyDebrief);
    if (timed.length <= 1) continue;

    const mergedGroups: RosterDay[] = [];
    for (const day of timed) {
      const last = mergedGroups[mergedGroups.length - 1];
      if (last && windowsOverlapOrTouch(last, day, STANDBY_RE.test(code) ? 90 : 15)) {
        last.dutyReport = minTime(last.dutyReport, day.dutyReport) || last.dutyReport;
        last.dutyDebrief = maxTime(last.dutyReport, last.dutyDebrief, day.dutyDebrief) || last.dutyDebrief;
        last.rawText = joinRaw(last.rawText, day.rawText);
        last.dutyHours = last.dutyReport && last.dutyDebrief ? round2(diffHours(last.dutyReport, last.dutyDebrief)) : last.dutyHours;
        handled.add(day);
      } else {
        const cloned = cloneDay(day);
        mergedGroups.push(cloned);
        handled.add(day);
      }
    }

    // Se existe uma linha-resumo sem detalhe suficiente, ela não precisa aparecer
    // como outro evento quando já há bloco cronometrado do mesmo código/dia.
    for (const day of untimed) handled.add(day);
    output.push(...mergedGroups);
  }

  for (const day of days) {
    if (!handled.has(day)) output.push(day);
  }

  return output.sort(compareRosterDays);
}

function dropAllDayDuplicates(days: RosterDay[]): RosterDay[] {
  const timedKeys = new Set(
    days
      .filter((day) => day.dutyReport && day.dutyDebrief)
      .map((day) => `${day.date}|${primaryComparableCode(day)}`),
  );
  const seen = new Set<string>();
  const output: RosterDay[] = [];

  for (const day of days.sort(compareRosterDays)) {
    const code = primaryComparableCode(day);
    const looseKey = `${day.date}|${code}`;
    const exactKey = `${looseKey}|${day.dutyReport || ''}|${day.dutyDebrief || ''}|${legSignature(day)}`;

    if (!day.dutyReport && !day.dutyDebrief && timedKeys.has(looseKey)) continue;
    if (seen.has(exactKey)) continue;
    seen.add(exactKey);
    output.push(day);
  }

  return output;
}

export function getActivityCodes(day: Pick<RosterDay, 'pairingCode' | 'rawText' | 'type'>): string[] {
  const direct = getRosterCodeDefinition(day.pairingCode || '')?.code;
  const byText = findRosterCodes(`${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`);
  return Array.from(new Set([direct, ...byText].filter((code): code is string => Boolean(code))));
}

export function primaryActivityCode(day: Pick<RosterDay, 'pairingCode' | 'rawText' | 'type'>): string {
  const mapped = getRosterCodeDefinition(day.pairingCode || '')?.code;
  if (mapped) return mapped;
  const direct = String(day.pairingCode || '').toUpperCase();
  if (direct && !/^LA\d{3,4}$/.test(direct)) return direct;
  return getActivityCodes(day)[0] || String(day.type || '').toUpperCase();
}

function primaryComparableCode(day: RosterDay): string {
  if (isFlightDay(day)) return `VOO:${routeSignature(day.legs) || legSignature(day)}`;
  const activity = primaryActivityCode(day);
  if (activity) return activity;
  return String(day.type || 'OTHER').toUpperCase();
}

function isFlightDay(day: RosterDay): boolean {
  return day.type === 'VOO' && Array.isArray(day.legs) && day.legs.length > 0;
}

function isMergeableActivity(day: RosterDay): boolean {
  const code = primaryActivityCode(day);
  return MERGEABLE_ACTIVITY_RE.test(code) && !isFlightDay(day);
}

function isEmptyDay(day: RosterDay): boolean {
  return day.type === 'OTHER' && !day.pairingCode && !day.dutyReport && !day.dutyDebrief && !(day.legs || []).length;
}

function compareRosterDays(a: RosterDay, b: RosterDay): number {
  const da = parseDate(a.date).getTime();
  const db = parseDate(b.date).getTime();
  if (da !== db) return da - db;
  const ta = timeToMinutes(a.dutyReport || '23:59');
  const tb = timeToMinutes(b.dutyReport || '23:59');
  if (ta !== tb) return ta - tb;
  return primaryComparableCode(a).localeCompare(primaryComparableCode(b));
}

function compareLegs(a: FlightLeg, b: FlightLeg): number {
  return timeToMinutes(a.departureTime || '23:59') - timeToMinutes(b.departureTime || '23:59') || String(a.flightNumber).localeCompare(String(b.flightNumber));
}

function dedupeLegs(legs: FlightLeg[]): FlightLeg[] {
  const seen = new Set<string>();
  const output: FlightLeg[] = [];
  for (const leg of legs) {
    const key = `${leg.flightNumber}|${leg.origin}|${leg.destination}|${leg.departureTime}|${leg.arrivalTime}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ ...leg });
  }
  return output;
}

function recomputeFlightTotals(day: RosterDay): void {
  if (!day.legs?.length) return;
  day.type = 'VOO';
  day.flyingHours = round2(day.legs.reduce((sum, leg) => sum + (leg.duration || diffHours(leg.departureTime, leg.arrivalTime, Boolean(leg.isNextDay))), 0));
  if (day.dutyReport && day.dutyDebrief) {
    day.isNextDay = Boolean(day.isNextDay) || timeToMinutes(day.dutyDebrief) < timeToMinutes(day.dutyReport);
    day.dutyHours = round2(diffHours(day.dutyReport, day.dutyDebrief, day.isNextDay));
  }
}

function windowsOverlapOrTouch(a: RosterDay, b: RosterDay, toleranceMinutes = 0): boolean {
  if (!a.dutyReport || !a.dutyDebrief || !b.dutyReport || !b.dutyDebrief) return false;
  const aStart = timeToMinutes(a.dutyReport);
  const aEnd = normalizeEnd(aStart, timeToMinutes(a.dutyDebrief));
  const bStart = timeToMinutes(b.dutyReport);
  const bEnd = normalizeEnd(bStart, timeToMinutes(b.dutyDebrief));
  return aStart <= bEnd + toleranceMinutes && bStart <= aEnd + toleranceMinutes;
}

function minTime(a?: string | null, b?: string | null): string | null {
  if (!a) return b || null;
  if (!b) return a || null;
  return timeToMinutes(a) <= timeToMinutes(b) ? cleanTime(a) : cleanTime(b);
}

function maxTime(anchor?: string | null, a?: string | null, b?: string | null): string | null {
  if (!a) return b || null;
  if (!b) return a || null;
  const start = timeToMinutes(anchor || a);
  const aa = normalizeEnd(start, timeToMinutes(a));
  const bb = normalizeEnd(start, timeToMinutes(b));
  return aa >= bb ? cleanTime(a) : cleanTime(b);
}

function normalizeEnd(startMinutes: number, endMinutes: number): number {
  return endMinutes < startMinutes ? endMinutes + 1440 : endMinutes;
}

function minutesBetween(a?: string | null, b?: string | null): number {
  if (!a || !b) return 9999;
  let diff = timeToMinutes(b) - timeToMinutes(a);
  if (diff < -720) diff += 1440;
  return diff;
}

function diffHours(start: string, end: string, forceNextDay = false): number {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff < 0 || forceNextDay) diff += 1440;
  return diff / 60;
}

function timeToMinutes(time: string): number {
  const [hour, minute] = cleanTime(time).split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function cleanTime(time: string): string {
  return String(time || '').replace('(+1)', '').replace(/^([0-9]):/, '0$1:');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string): Date {
  const [day, month, year] = value.split('/').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function legSignature(day: RosterDay): string {
  return (day.legs || []).map((leg) => `${leg.flightNumber}-${leg.origin}-${leg.destination}-${leg.departureTime}`).join(',');
}

function routeSignature(legs: FlightLeg[]): string {
  if (!legs.length) return '';
  const points = [legs[0].origin];
  for (const leg of legs) if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  return points.join('-');
}

function joinRaw(...parts: Array<string | null | undefined>): string {
  return Array.from(new Set(parts.map((part) => String(part || '').trim()).filter(Boolean))).join('\n');
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
  }
  return map;
}
