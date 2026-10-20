import { createHash } from 'node:crypto';
import { buildCanonicalRosterEvents } from './generated/canonicalRoster.mjs';
import { measureCanonicalDuty, publishedDutyEndpoints, canonicalDutyDurationLabel } from './generated/canonicalDutyMeasurement.mjs';

const ZONE = 'America/Sao_Paulo';
const stamp = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const normalized = new Date(value).toISOString();
  return normalized.slice(0, 10) === value.slice(0, 10) ? normalized : null;
};
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = value => /^\d{1,2}:\d{2}(?:\(\+\d{1,3}\))?$/.test(String(value || '')) ? String(value) : 'não disponível';
const sourceLabel = value => ({ published: 'publicada', estimated: 'estimada', absent: 'ausente', unknown: 'não comprovada' })[value] || 'não comprovada';
const civil = value => new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const display = value => value === null ? 'pendente' : new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
function baseDay(day) {
  const input = String(day?.date || '');
  const br = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  // The canonical parser accepts this complete published format. ISO is not
  // accepted by that parser: never let its fallback silently select day 1.
  if (!br || Number(br[3]) < 1000) return null;
  const value = `${br[3]}-${br[2]}-${br[1]}`;
  for (const [field, part] of [['dayNumber', br[1]], ['month', br[2]], ['year', br[3]]]) {
    if (day[field] !== undefined && day[field] !== null && day[field] !== '' && Number(day[field]) !== Number(part)) return null;
  }
  return value && stamp(value + 'T12:00:00Z')?.slice(0, 10) === value ? value : null;
}
// Validate explicit civil-day evidence against the consumer's existing instants.
// A mismatch stays pending; this adapter never repairs dates or recalculates clocks.
function markerMatches(value, day, instant) {
  const match = String(value || '').match(/\(\+(\d+)\)/);
  if (!match) return true;
  const date = baseDay(day);
  if (!date || instant === null || !Number.isFinite(Number(instant))) return false;
  if (!Number.isSafeInteger(Number(match[1])) || Number(match[1]) > 370) return false;
  const expected = new Date(date + 'T12:00:00Z');
  expected.setUTCDate(expected.getUTCDate() + Number(match[1]));
  return expected.toISOString().slice(0, 10) === civil(instant);
}
function preservedEvidenceConflicts(day) {
  if (!day.publishedClockEvidence) return false;
  const boundaries = value => JSON.stringify([value.dutyReport, value.dutyDebrief, value.dutyReportSource, value.dutyDebriefSource]);
  const expected = boundaries(day), pending = [day.publishedClockEvidence], clocks = new Map();
  let checked = 0;
  // Canonical normalization preserves pre-selection records here. They remain
  // evidence even when the outer row has already selected one physical leg.
  while (pending.length) {
    const record = pending.pop();
    if (++checked > 4440 || !record || typeof record !== 'object' || boundaries(record) !== expected || !Array.isArray(record.legs)) return true;
    if (record.records !== undefined) {
      if (!Array.isArray(record.records) || record.records.length > 4440) return true;
      pending.push(...record.records);
    }
    for (const leg of record.legs) {
      if (!leg || typeof leg !== 'object') return true;
      const key = String(leg.departureTime || '');
      const value = JSON.stringify([leg.arrivalTime, leg.presentationTime]);
      if (clocks.has(key) && clocks.get(key) !== value) return true;
      clocks.set(key, value);
    }
  }
  return false;
}
export function buildDutyFacts({ profile, snapshot, accessAllowed = false, page = 0 }) {
  const denied = { state: 'unavailable', signature: null, items: [], summary: 'Revisão da escala · snapshot não autorizado ou indisponível.', basis: 'Não há snapshot autorizado para esta consulta.' };
  if (!accessAllowed || !profile?.email || snapshot?.email !== profile.email
    || !profile.chatId || String(snapshot.chatId) !== String(profile.chatId)
    || !snapshot?.roster || !Array.isArray(snapshot.roster.days)) return denied;
  const revision = digest(snapshot.roster).slice(0, 12);
  const updated = stamp(snapshot.updatedAt);
  const signature = digest([snapshot.roster, snapshot.updatedAt, snapshot.source]);
  const origin = ({ 'telegram-pdf': 'PDF recebido no Telegram', app: 'sincronização do app' })[snapshot.source] || 'origem declarada não comprovada';
  const header = `Snapshot do Concierge · revisão ${revision}\nAtualização do snapshot: ${updated ? display(updated) + ' BRT' : 'não comprovada'}.`;
  const caveat = 'Correspondência com a escala ativa não comprovada.';
  const common = `${header}\nOrigem declarada: ${origin}.\n${caveat}\nReferência do leitor: BRT (UTC−03:00); fuso original do documento não comprovado.`;
  const result = (items, pending = []) => {
    const pageCount = Math.max(1, Math.ceil(items.length / 3));
    const currentPage = Number.isSafeInteger(page) ? Math.max(0, Math.min(page, pageCount - 1)) : 0;
    const offset = currentPage * 3;
    const shown = items.slice(offset, offset + 3);
    const lines = shown.map(item => `${item.kind === 'interval' ? 'Intervalo entre jornadas' : 'Programação ' + item.date}: ${display(item.start)} → ${display(item.end)} · ${canonicalDutyDurationLabel(item.minutes)}${item.reasons.length ? '\nPendente: ' + item.reasons.join(' ') : ''}`);
    return { state: pending.length || items.some(item => item.minutes === null) ? 'incomplete' : items.length ? 'available' : 'no_data', signature, revision, updatedAt: updated, items, page: currentPage, pageCount,
      summary: `Revisão factual · BRT\n${header}\n${caveat}\n\n${lines.length ? lines.join('\n\n') : 'Nenhuma programação mensurável neste snapshot.'}${pageCount > 1 ? `\nPágina ${currentPage + 1}/${pageCount} · registros ${offset + 1}–${offset + shown.length} de ${items.length}.` : ''}${pending.length ? '\nPendente: ' + pending.join(' ') : ''}\n\nLimite aplicável e conformidade: indeterminados.`,
      basis: `Fundamento da leitura\n${common}\n\nOrigem: horários e proveniência preservados no snapshot; atualização não comprova nova importação da escala. Revisão identifica o conteúdo consultado, sem consulta à escala ativa.\n\nMedição: motor canônico existente, agrupamento por jornada e extremos publicados. Chegada não comprova liberação; tempo em solo permanece dentro da jornada. Intervalo não comprova repouso legal ou descanso realizado.\n\n${shown.map((item, i) => `${i + 1}. ${item.kind === 'interval' ? 'Intervalo' : 'Programação ' + item.date} · início: ${sourceLabel(item.startSource)} (${item.startLiteral || display(item.start)}); fim: ${sourceLabel(item.endSource)} (${item.endLiteral || display(item.end)}). ${item.reasons.join(' ') || 'Extremos publicados comprovados para esta medição.'}`).join('\n')}\n${pending.join(' ')}\n\nSem regra aplicável verificada, regime e composição confirmados, não há limite, irregularidade, extensão permitida ou autorização operacional.` };
  };
  if (snapshot.roster.days.some(day => !baseDay(day))) return result([], ['Data inválida, sem formato DD/MM/AAAA comprovado ou conflitante com dia/mês/ano do registro. Nenhum horário de fallback foi medido.']);
  if (snapshot.roster.days.length > 370 || snapshot.roster.days.some(day => !Array.isArray(day.legs) || day.legs.length > 12 || day.legs.some(leg => !leg || typeof leg !== 'object' || Array.isArray(leg)))) return result([], ['Estrutura da publicação incompleta; nenhum horário de fallback foi medido.']);
  const sourceRows = new Map();
  for (const day of snapshot.roster.days) {
    if (preservedEvidenceConflicts(day)) return result([], ['Registros duplicados preservados têm extremos ou proveniência conflitantes ou não comprovados.']);
    // Recognize an occurrence before comparing its endpoints. Arrival/release
    // and their provenance are evidence, never part of duplicate identity.
    // Compare each repeated leg, including repeats inside a single source row.
    const occurrences = day.legs.length ? day.legs : [null];
    for (const leg of occurrences) {
      const declaredOffset = Number(String(leg?.departureTime || '').match(/\(\+(\d+)\)/)?.[1] || 0);
      const key = JSON.stringify(leg ? ['flight', baseDay(day), leg.flightNumber, leg.origin, leg.destination, declaredOffset]
        : ['activity', baseDay(day), day.type, day.pairingCode]);
      const evidence = JSON.stringify([day.type, day.pairingCode, day.dutyReport, day.dutyDebrief, day.dutyReportSource, day.dutyDebriefSource,
        leg?.departureTime, leg?.arrivalTime, leg?.presentationTime, leg?.presentationTimeSource, leg?.departureTimeSource, leg?.arrivalTimeSource,
        leg?.isNextDay, leg?.arrivalDayOffset, leg?.workType]);
      if (sourceRows.has(key) && sourceRows.get(key) !== evidence) return result([], ['Registros duplicados têm extremos ou proveniência conflitantes.']);
      sourceRows.set(key, evidence);
    }
  }
  let events;
  try { events = buildCanonicalRosterEvents(snapshot.roster); } catch { return result([], ['Leitura canônica indisponível.']); }
  const groups = new Map();
  for (const event of events) if (['flight', 'duty'].includes(event.kind)) {
    const group = groups.get(event.journeyId) || []; group.push(event); groups.set(event.journeyId, group);
  }
  const rows = [];
  for (const group of groups.values()) {
    group.sort((a, b) => Date.parse(a.startDateTime) - Date.parse(b.startDateTime));
    const first = group[0], last = group.at(-1);
    const measured = measureCanonicalDuty(events, first.id);
    const endpoints = publishedDutyEndpoints(events, first.id);
    const startSource = measured?.reportSource || 'unknown', endSource = measured?.debriefSource || 'unknown';
    let start = endpoints.start, end = endpoints.end;
    const reasons = [...(measured?.reasons || [])];
    const markers = group.every(event => markerMatches(event.leg?.departureTime, event.publishedDay, Date.parse(event.startDateTime)) && markerMatches(event.leg?.arrivalTime, event.publishedDay, Date.parse(event.endDateTime)));
    const startMarker = markerMatches(first.leg?.presentationTime || first.publishedDay.dutyReport, first.publishedDay, start);
    const endMarker = markerMatches(last.publishedDay.dutyDebrief, last.publishedDay, end);
    if (!markers || !startMarker || !endMarker) { start = null; end = null; reasons.push('Deslocamento de data publicado não comprovado pelos instantes canônicos.'); }
    if (startSource !== 'published') start = null;
    if (endSource !== 'published') end = null;
    const minutes = measured?.state === 'available' && markers && startMarker && endMarker && start !== null && end !== null ? measured.minutes : null;
    if (minutes === null && !reasons.length) reasons.push('Extremos publicados ou composição não comprovados.');
    rows.push({ kind: 'duty', date: baseDay(first.publishedDay), start, end, minutes, startSource, endSource,
      startLiteral: literal(first.leg?.presentationTime || first.publishedDay.dutyReport), endLiteral: literal(last.publishedDay.dutyDebrief), reasons: [...new Set(reasons)], order: Date.parse(first.startDateTime), journeyId: first.journeyId,
      availability: /HSB|SOBREAVISO|ASB|RESERVA|RSV|\bRES\b/.test(`${first.publishedDay.type} ${first.publishedDay.pairingCode}`.toUpperCase()) });
  }
  rows.sort((a, b) => a.order - b.order);
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]; items.push(row);
    const next = rows[i + 1];
    if (!next || row.end === null || next.start === null || row.end >= next.start || row.availability || next.availability) continue;
    const blocked = events.some(event => ['flight', 'duty'].includes(event.kind) && ![row.journeyId, next.journeyId].includes(event.journeyId) && Date.parse(event.startDateTime) < next.start && Date.parse(event.endDateTime) > row.end);
    if (!blocked) items.push({ kind: 'interval', start: row.end, end: next.start, minutes: (next.start - row.end) / 60_000, startSource: 'published', endSource: 'published', reasons: [] });
  }
  return result(items);
}
