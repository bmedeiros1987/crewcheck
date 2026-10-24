// Planned continuity only. Never asserts that a scheduled flight was operated.
export function departureRosterProjection({ events, targetId, presentationAt, origin, currentAirport, now }) {
  const deadline = Date.parse(presentationAt);
  if (!Array.isArray(events) || !Number.isFinite(now) || !Number.isFinite(deadline) || deadline <= now || !/^[A-Z]{3}$/.test(currentAirport || '')) return null;
  if (events.some(e => e.id !== targetId && !e.placeholder && e.kind === 'flight' && (!Number.isFinite(Date.parse(e.startAt)) || !Number.isFinite(Date.parse(e.endAt))))) return null;
  const rows = events.filter(e => e.id !== targetId && !e.placeholder && e.kind === 'flight')
    .map(e => ({ ...e, start: Date.parse(e.startAt), end: Date.parse(e.endAt) }))
    .filter(e => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > now && e.start < deadline)
    .sort((a,b) => a.start - b.start);
  if (!rows.length) return null;
  let airport = currentAirport, end = now;
  const ids = new Set();
  for (const row of rows) {
    if (!row.id || ids.has(row.id) || row.start < now || row.start < end || row.end <= row.start || row.end >= deadline
      || row.origin !== airport || !/^[A-Z]{3}$/.test(row.destination || '') || /CANCEL|DIVERT|DESVIAD/i.test(row.status || '')) return null;
    ids.add(row.id); airport = row.destination; end = row.end;
  }
  if (airport !== origin) return null;
  return { kind: 'planned', airport, arrivalAt: new Date(end).toISOString(), eventIds: [...ids] };
}
