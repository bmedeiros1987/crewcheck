import { capturePublishedFreeDayStart } from './freeDayStartEvidence';
import type { CrewRoster, RosterDay } from './pdfParser';
import type { OwnedPlannedRoster } from './plannedRosterStore';
import { freeDayPostponementIndemnity } from './compensationPolicy';

export const FREE_DAY_ACT_SOURCE = 'ACT LATAM Comissários 2025/2027 · 3.4.4, §§ 1–6';
export const FREE_DAY_ACT_URL = 'https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf';
export type FreeDayCause = 'ordinary' | 'weather' | 'unscheduled_maintenance' | 'catastrophe' | 'infrastructure' | 'unknown';
export type FreeDayCauseEvidence = { cause: FreeDayCause; source: string; verified: boolean };
export type FreeDayAlert = {
  id: string; sequenceId: string; date: string; sequenceEnd: string;
  oldClock: string; newClock: string; oldOffset: number; newOffset: number; delayMinutes: number;
  beforeVersion: string; afterVersion: string; beforeSource: string; afterSource: string;
  convertedDocument: boolean; possibleAmount: number | null; currency: 'BRL';
  condition: string; cause: FreeDayCause; payment: 'unconfirmed';
};
export type FreeDayReview = { alerts: FreeDayAlert[]; pending: { date: string; reason: string }[]; reason: string | null };
const REST = /^(DO|DOF|DOP|DOPR|DR|OFF)$/;

export function freeDayVersion(roster: CrewRoster): string {
  const text = JSON.stringify({ year: roster.year, month: roster.month, crewId: roster.crewId,
    rawText: String(roster.rawText || '').replace(/\s+/g, ' ').trim(),
    starts: roster.days.map(day => [day.date, day.type, day.freeDayStartEvidence || null]) });
  let hash = 2166136261;
  for (const ch of text) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return 'rest-v1-' + (hash >>> 0).toString(16).padStart(8, '0');
}
function iso(day: RosterDay): string | null {
  const match = String(day.date || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const value = match ? `${match[3]}-${match[2]}-${match[1]}` : String(day.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}
function rest(day: RosterDay): boolean { return REST.test(String(day.pairingCode || day.type || '').toUpperCase()) && !day.legs?.length; }
function sequences(roster: CrewRoster) {
  const dates = new Map<string, RosterDay[]>();
  for (const day of roster.days.filter(rest)) { const date = iso(day); if (date) dates.set(date, [...(dates.get(date) || []), day]); }
  const groups: { date: string; end: string; days: RosterDay[] }[] = [];
  for (const [date, days] of [...dates].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = groups.at(-1);
    if (previous && Date.parse(date + 'T12:00:00Z') - Date.parse(previous.end + 'T12:00:00Z') === 86400000) previous.end = date;
    else groups.push({ date, end: date, days });
  }
  return groups;
}
function boundary(days: RosterDay[]) {
  const evidence = days.map(day => day.freeDayStartEvidence);
  const first = evidence[0];
  if (!first || evidence.some(item => !item || item.date !== days[0].date || item.clock !== first.clock || item.utcOffsetMinutes !== first.utcOffsetMinutes)) return null;
  const literal = capturePublishedFreeDayStart(first.tokenExcerpt.split(/\s+/), first.date);
  if (!literal || literal.clock !== first.clock || literal.code !== first.code || !REST.test(first.code)) return null;
  if (first.clockSource !== 'published' || first.timeZoneSource !== 'published'
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(first.clock || '') || !Number.isInteger(first.utcOffsetMinutes)
    || Math.abs(first.utcOffsetMinutes!) > 840 || first.origin !== 'AIMS published rest tokens') return null;
  return { clock: first.clock!, offset: first.utcOffsetMinutes!, converted: first.convertedDocument };
}
function instant(date: string, clock: string, offset: number): number { return Date.parse(date + 'T' + clock + ':00Z') - offset * 60000; }

export function assessFreeDayDelay(delayMinutes: number, date: string, cabinAct: boolean, proof?: FreeDayCauseEvidence) {
  const cause: FreeDayCause = proof?.verified && typeof proof.source === 'string' && proof.source.trim()
    && ['ordinary','weather','unscheduled_maintenance','catastrophe','infrastructure'].includes(proof.cause) ? proof.cause : 'unknown';
  const exception = ['weather', 'unscheduled_maintenance', 'catastrophe', 'infrastructure'].includes(cause);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z'))
    || new Date(date+'T12:00:00Z').toISOString().slice(0,10) !== date || !Number.isFinite(delayMinutes) || delayMinutes < 0) return { possibleAmount: null, cause, condition: 'Atraso não verificável.' };
  if (!cabinAct || date < '2025-12-01' || date > '2027-11-30') return { possibleAmount: null, cause, condition: 'Aplicabilidade do ACT de comissários pendente.' };
  if (date >= '2026-12-01') return { possibleAmount: null, cause, condition: 'Valor sujeito à atualização salarial do ACT (3.2.4); confira a tabela vigente.' };
  const regular = freeDayPostponementIndemnity(delayMinutes / 60, false);
  const exceptional = freeDayPostponementIndemnity(delayMinutes / 60, true);
  if (cause === 'unknown' && regular !== exceptional) return { possibleAmount: regular, cause,
    condition: 'Possível indenização se não houver exceção comprovada: meteorologia desfavorável, manutenção não programada ou imperiosa necessidade por catástrofe/infraestrutura, sem falha administrativa. Motivo não informado.' };
  return { possibleAmount: exception ? exceptional : regular, cause,
    condition: exception ? 'Exceção com fonte informada: limite de 12h; indenização somente se ultrapassado. Confirme a fonte e a execução.'
      : cause === 'ordinary' ? 'Motivo ordinário com fonte informada: limite de 4h. Confirme a fonte e a execução.'
        : 'Motivo não informado; atraso supera os dois limites previstos. Confirme a execução e a fonte.' };
}

export function reviewFreeDayPostponements(planned: OwnedPlannedRoster | null, current: CrewRoster, currentSource: string,
  owner: string, cabinAct: boolean, causes: Record<string, FreeDayCauseEvidence> = {}): FreeDayReview {
  const result: FreeDayReview = { alerts: [], pending: [], reason: null };
  if (!owner || !planned || planned.owner !== owner) return { ...result, reason: 'Sem referência publicada desta conta.' };
  if (!current.days?.length || planned.period.year !== current.year || planned.period.month !== current.month) return { ...result, reason: 'Referência e escala atual pertencem a períodos diferentes.' };
  if (!planned.roster.crewId || !current.crewId || String(planned.roster.crewId) !== String(current.crewId)
    || !planned.roster.base || planned.roster.base !== current.base) return { ...result, reason: 'Identidade ou base das versões não verificada.' };
  const beforeVersion = freeDayVersion(planned.roster), afterVersion = freeDayVersion(current);
  if (beforeVersion === afterVersion) return result;
  const after = new Map(sequences(current).map(group => [group.date, group]));
  for (const group of sequences(planned.roster)) {
    if (!group.date.startsWith(`${current.year}-${String(current.month).padStart(2, '0')}-`)) continue;
    const updated = after.get(group.date);
    const oldStart = boundary(group.days), newStart = updated && boundary(updated.days);
    if (!oldStart || !newStart) { result.pending.push({ date: group.date, reason: 'Início literal, sequência correspondente ou timezone publicado ausente/ambíguo. Não foi usada chegada de voo nem meia-noite.' }); continue; }
    const delayMinutes = (instant(group.date, newStart.clock, newStart.offset) - instant(group.date, oldStart.clock, oldStart.offset)) / 60000;
    if (delayMinutes <= 240) continue;
    const sequenceId = group.date;
    result.alerts.push({ id: `${sequenceId}:${beforeVersion}:${afterVersion}`, sequenceId, date: group.date, sequenceEnd: group.end,
      oldClock: oldStart.clock, newClock: newStart.clock, oldOffset: oldStart.offset, newOffset: newStart.offset, delayMinutes,
      beforeVersion, afterVersion, beforeSource: planned.source, afterSource: currentSource,
      convertedDocument: oldStart.converted || newStart.converted,
      ...assessFreeDayDelay(delayMinutes, group.date, cabinAct, causes[sequenceId]), currency: 'BRL', payment: 'unconfirmed' });
  }
  return result;
}
export function freeDayAlertText(alert: FreeDayAlert): string {
  const date = alert.date.split('-').reverse().join('/'), hours = Math.floor(alert.delayMinutes / 60), minutes = alert.delayMinutes % 60;
  const amount = alert.possibleAmount === null ? 'Indenização pendente.' : alert.possibleAmount > 0 ? `Possível indenização ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(alert.possibleAmount)}.` : 'Limite excepcional não ultrapassado.';
  return `Folga ${date}: ${alert.oldClock} → ${alert.newClock}, atraso ${hours}h${String(minutes).padStart(2, '0')}. ${amount} ${alert.condition} Fontes: ${alert.beforeSource} → ${alert.afterSource}. ${alert.convertedDocument ? 'PDF convertido: confirme na publicação original da empresa. ' : ''}Pagamento não confirmado.`;
}
