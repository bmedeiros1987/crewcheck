/** Published wall clocks, not finite canonical fallback instants, establish
 * forecast completeness. This never establishes a payment confirmation. */
const validClock = (value: unknown) => /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
const unresolvedOrigin = (value: unknown) => ['estimated', 'absent', 'unknown'].includes(String(value || ''));
type EvidenceEvent = { kind?: string; presentation?: string; departure?: string; arrival?: string; day?: any; canonical?: any };
export function financialIntervalEvidenceIssue(events: readonly EvidenceEvent[]): string | null {
  if (!events.length) return 'Programação ausente.';
  const first = events[0], firstDay = first.day || first.canonical?.publishedDay || {}, day = firstDay.publishedClockEvidence || firstDay;
  if (first.kind === 'flight') {
    const firstLeg = day.legs?.[first.canonical?.legIndex || 0] || first.canonical?.leg;
    const report = firstLeg?.presentationTime || day.dutyReport;
    if (!validClock(report) || (!firstLeg?.presentationTime && unresolvedOrigin(day.dutyReportSource))
      || (!firstLeg?.presentationTime && day.dutyReportSource !== 'published' && report === firstLeg?.departureTime)) return 'Apresentação publicada ausente ou estimada.';
    for (const event of events) {
      const eventDay = event.day || event.canonical?.publishedDay || {};
      const published = eventDay.publishedClockEvidence || eventDay;
      const leg = published.legs?.[event.canonical?.legIndex || 0] || event.canonical?.leg;
      if (!leg || !validClock(leg.departureTime) || !validClock(leg.arrivalTime)) return 'Etapa com partida/chegada publicada ausente ou inválida.';
      // Canonical normalization may discard an invalid intermediate leg. The
      // original published day must still block an apparently complete total.
      if (Array.isArray(published.legs) && published.legs.some((item: any) => !validClock(item.departureTime) || !validClock(item.arrivalTime))) return 'Etapa intermediária publicada incompleta.';
    }
  } else if (['duty','training'].includes(String(first.kind || '')) || /ASB|HSB|RES|CRM/.test(String(day.type || ''))) {
    if (!validClock(day.dutyReport) || !validClock(day.dutyDebrief) || unresolvedOrigin(day.dutyReportSource) || unresolvedOrigin(day.dutyDebriefSource)) return 'Início/fim publicados ausentes ou estimados.';
  }
  return null;
}
