import { financialIntervalEvidenceIssue } from './financialIntervalEvidence';

type SalaryActivityEvent = { id: string; kind?: string; day?: any; canonical?: any; operationalTimeZone?: string | null };

/** Canonical fallback instants describe an activity; they do not prove the
 * published salary interval. Missing provenance is not a confirmed zero. */
export function assessSalaryActivities<T extends SalaryActivityEvent>(events: readonly T[], hoursForEvent: (event: T) => number, metric: number) {
  const groups = new Map<string, T[]>();
  for (const event of events) groups.set(event.id, [...(groups.get(event.id) || []), event]);
  const rows = [...groups].map(([id, duplicates]) => {
    const event = duplicates[0], day = event.day || event.canonical?.publishedDay || {}, publishedDay = day.publishedClockEvidence || day;
    let issue: string | null = null;
    for (const item of duplicates) {
      const source = item.day || item.canonical?.publishedDay || {};
      const published = source.publishedClockEvidence || source;
      try {
      issue = !id ? 'Identidade da atividade ausente.' : financialIntervalEvidenceIssue([item]);
      if (!issue && (published.records || [published]).some((record: any) => record.dutyReportSource !== 'published' || record.dutyDebriefSource !== 'published')) issue = 'Origem publicada do início/fim não comprovada.';
      if (!issue && duplicates.some(other => { const otherDay = other.day || other.canonical?.publishedDay || {}; return otherDay.dutyReport !== day.dutyReport || otherDay.dutyDebrief !== day.dutyDebrief; })) issue = 'Registros duplicados divergem no início/fim publicados.';
      } catch { issue = 'Evidência de horários inválida.'; }
      if (issue) break;
    }
    const hours = issue ? null : hoursForEvent(event);
    const value = hours === null ? null : hours * metric;
    if (!issue && (!Number.isFinite(hours) || Number(hours) < 0 || !Number.isFinite(value) || Number(value) < 0)) issue = 'Intervalo ou tarifa salarial inválidos.';
    return { id, date: String(day.date || event.canonical?.date || ''), code: String(day.pairingCode || day.type || ''),
      report: publishedDay.dutyReport ?? null, release: publishedDay.dutyDebrief ?? null,
      reportSource: publishedDay.dutyReportSource ?? 'unknown', releaseSource: publishedDay.dutyDebriefSource ?? 'unknown', timeZone: event.operationalTimeZone ?? null, currency: 'BRL' as const,
      timeKnown: !issue, hours: issue ? null : hours, value: issue ? null : value, issue };
  });
  const known = rows.filter(row => row.timeKnown);
  const knownHours = known.reduce((sum, row) => sum + row.hours!, 0);
  const knownAmount = known.reduce((sum, row) => sum + row.value!, 0);
  const pendingCount = rows.length - known.length, complete = pendingCount === 0;
  return { rows, knownHours, knownAmount, knownCount: known.length, pendingCount, complete,
    hours: complete ? knownHours : NaN, amount: complete ? knownAmount : NaN };
}
