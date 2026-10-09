import type { CanonicalRosterEvent } from './canonicalRoster';

export type CanonicalDutyMeasurement = {
  state: 'available' | 'incomplete';
  journeyId: string;
  date: string;
  program: string;
  base: string;
  label: string;
  minutes: number | null;
  groundMinutes: number | null;
  start: string | null;
  end: string | null;
  reasons: string[];
  source: 'canonical_published_roster';
  limitConfirmed: false;
  reportSource: 'published' | 'estimated' | 'absent' | 'unknown';
  debriefSource: 'published' | 'estimated' | 'absent' | 'unknown';
};

function clock(value: string | null | undefined): string | null {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}
function clockNear(reference: number, value: string, direction: 'before' | 'after'): number {
  // Same BRT reference as canonicalRoster.dateAt; never device-local setters.
  const iso = new Date(reference - 3 * 60 * 60_000).toISOString().slice(0, 10);
  let result = Date.parse(`${iso}T${value}:00-03:00`);
  if (direction === 'before' && result > reference) result -= 24 * 60 * 60_000;
  if (direction === 'after' && result < reference) result += 24 * 60 * 60_000;
  return result;
}

/** Read the selected canonical journey. Ground remains inside its elapsed span;
 * another journey/rest on the same day is never added. No generic duty limit,
 * activation, estimated presentation or estimated cut is confirmed here. */
export function measureCanonicalDuty(events: readonly CanonicalRosterEvent[], selectedId: string): CanonicalDutyMeasurement | null {
  const selected = events.find(e => e.id === selectedId);
  if (!selected || !['flight', 'duty'].includes(selected.kind)) return null;
  let code = `${selected.publishedDay.type || ''} ${selected.publishedDay.pairingCode || ''}`.toUpperCase();
  let reserveDeclared = /\b(?:ASB|RES|RESERVA|RSV)\b/.test(code);
  const result: CanonicalDutyMeasurement = {
    state: 'incomplete', journeyId: selected.journeyId, date: selected.date,
    program: selected.flightNumber || selected.publishedDay.pairingCode || code,
    base: selected.publishedDay.base || selected.origin,
    label: selected.kind === 'flight' ? 'Jornada publicada' : /HSB|SOBREAVISO/.test(code) ? 'Sobreaviso publicado' : /ASB|RES/.test(code) ? 'Reserva publicada' : 'Programação publicada',
    minutes: null, groundMinutes: null, start: null, end: null, reasons: [],
    source: 'canonical_published_roster', limitConfirmed: false,
    reportSource: selected.publishedDay.dutyReportSource || (selected.publishedDay.dutyReport ? 'unknown' : 'absent'),
    debriefSource: selected.publishedDay.dutyDebriefSource || (selected.publishedDay.dutyDebrief ? 'unknown' : 'absent'),
  };
  if (!selected.journeyId) { result.reasons.push('Identidade da jornada ausente.'); return result; }
  const unique = new Map<string, CanonicalRosterEvent>();
  for (const e of events) if (e.kind === selected.kind && e.journeyId === selected.journeyId) {
    const key = [e.journeyId, e.startDateTime, e.endDateTime, e.flightNumber, e.origin, e.destination].join('|');
    unique.set(key, e);
  }
  const group = [...unique.values()].sort((a,b) => Date.parse(a.startDateTime)-Date.parse(b.startDateTime));
  const first = group[0], last = group.at(-1)!;
  code = group.map(e => `${e.publishedDay.type || ''} ${e.publishedDay.pairingCode || ''}`).join(' ').toUpperCase();
  reserveDeclared = /\b(?:ASB|RES|RESERVA|RSV)\b/.test(code);
  result.reportSource = first.leg?.presentationTime ? 'published' : first.publishedDay.dutyReportSource || (first.publishedDay.dutyReport ? 'unknown' : 'absent');
  result.debriefSource = last.publishedDay.dutyDebriefSource || (last.publishedDay.dutyDebrief ? 'unknown' : 'absent');
  if (group.some(e => !Number.isFinite(Date.parse(e.startDateTime)) || !Number.isFinite(Date.parse(e.endDateTime)) || Date.parse(e.endDateTime) < Date.parse(e.startDateTime))) {
    result.reasons.push('Horários canônicos incompletos ou intervalo inválido.'); return result;
  }
  let start = Date.parse(first.startDateTime), end = Date.parse(last.endDateTime);
  let groundMinutes = 0;
  if (selected.kind === 'flight') {
    const presentation = clock(first.leg?.presentationTime) || (first.legIndex === 0 ? clock(first.publishedDay.dutyReport) : null);
    const explicitPresentation = clock(first.leg?.presentationTime) === presentation && presentation !== clock(first.departure)
      || first.legIndex === 0 && clock(first.publishedDay.dutyReport) === presentation && presentation !== clock(first.departure);
    const debrief = clock(last.publishedDay.dutyDebrief);
    if (!presentation || !explicitPresentation || result.reportSource !== 'published') result.reasons.push('Apresentação publicada não comprovada.');
    if (!debrief || result.debriefSource !== 'published' || last.legIndex !== last.legCount - 1) result.reasons.push('Liberação publicada não comprovada; corte estimado não confirma jornada.');
    if (result.reasons.length) return result;
    start = clockNear(start, presentation!, 'before');
    end = clockNear(end, debrief!, 'after');
    if (!reserveDeclared && Date.parse(first.startDateTime) - start > 180 * 60_000) {
      result.reasons.push('Apresentação incompatível com a primeira etapa publicada.'); return result;
    }
    for (let i=1;i<group.length;i++) {
      const gap = (Date.parse(group[i].startDateTime) - Date.parse(group[i-1].endDateTime)) / 60_000;
      if (gap < 0 || group[i-1].destination !== group[i].origin) { result.reasons.push('Continuidade física da jornada não comprovada.'); return result; }
      groundMinutes += gap;
    }
    // Reserve attached to this published flight block contributes from its
    // actual published presentation. A separate ASB/HSB is never linked merely
    // by proximity or a shortened availability interval.
    if (/ASB|RES/.test(code)) {
      const reserveStart = clock(first.publishedDay.dutyReport);
      if (!reserveStart) { result.reasons.push('Início da reserva acionada não comprovado.'); return result; }
      start = Math.min(start, clockNear(Date.parse(first.startDateTime), reserveStart, 'before'));
    }
    if (/HSB|SOBREAVISO/.test(code)) {
      result.reasons.push('Acionamento/composição e regra de sobreaviso pendentes.'); return result;
    }
  } else if (!clock(first.publishedDay.dutyReport) || !clock(last.publishedDay.dutyDebrief) || result.reportSource !== 'published' || result.debriefSource !== 'published') {
    result.reasons.push('Início/fim da programação não comprovados.'); return result;
  }
  if (end < start) { result.reasons.push('Intervalo de jornada inválido.'); return result; }
  return { ...result, state: 'available', minutes: (end-start)/60_000, groundMinutes, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

export function canonicalDutyDurationLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return 'Duração pendente';
  const whole = Math.round(minutes);
  return `${Math.floor(whole / 60)}h${String(whole % 60).padStart(2, '0')}`;
}
