/** Reuse the publication/session-fenced display history for HOME's date-scoped consumers. */
export function repairHomeContinuity(source) {
  const before = '<Cockpit events={events}';
  const after = '<Cockpit events={rosterEvents}';
  if (!source.includes('rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster')) {
    throw new Error('HOME continuity requires the session-fenced roster window');
  }
  if (source.split(after).length === 2 && !source.includes(before)) return source;
  if (source.split(before).length !== 2 || source.includes(after)) {
    throw new Error('HOME continuity: unique Cockpit consumer missing');
  }
  return source.replace(before, after);
}

function replaceOne(source, before, after) {
  if (source.split(after).length === 2 && !source.replace(after, '').includes(before)) return source;
  if (source.includes(after) || source.split(before).length !== 2) throw new Error('HOME destination anchor missing or duplicated: ' + before);
  return source.replace(before, after);
}

export function repairHomeDestinations(source) {
  for (const [before, after] of [
    ['? events.find((candidate) => candidate.id === flightSurfaceContext.programId', '? rosterEvents.find((candidate) => candidate.id === flightSurfaceContext.programId'],
    ["function openFlightSurface(targetView: 'radar' | 'weather')", "function openFlightSurface(targetView: 'radar' | 'weather' | 'departure')"],
    ['<button className="primary" onClick={() => setView(\'departure\')}>', '<button className="primary" onClick={() => openFlightSurface(\'departure\')}>'],
    ['data-smart-departure-v1406="true" onClick={() => setView(\'departure\')}', 'data-smart-departure-v1406="true" onClick={() => { setPendingNavigationContext({ sourceView: \'cockpit\', targetView: \'departure\', programId: event.id, dateEpochMs: eventStartDateTime(event).getTime(), flightKey: event.flightNumber, returnView: \'cockpit\', policy: \'persistent-until-return\' }); setView(\'departure\'); }}'],
    ['<Departure event={departureEvent} events={events}', '<Departure event={departureEvent} events={departureContext?.programId ? rosterEvents : events}'],
    ['<strong>Alertas operacionais</strong><span>{alertCount ?', '<strong>Alertas da escala ativa</strong><span>{alertCount ?'],
    ["{alertCount} {alertCount === 1 ? 'alerta' : 'alertas'}</button>", "{alertCount} {alertCount === 1 ? 'alerta' : 'alertas'} da escala ativa</button>"],
  ]) source = replaceOne(source, before, after);
  return source;
}

export function repairRosterDeparture(source) {
  return replaceOne(source,
    "onClick={() => setView('departure')}",
    "onClick={() => { setPendingNavigationContext({ sourceView: 'roster', targetView: 'departure', programId: event.id, dateEpochMs: dateOf(event).getTime(), flightKey: event.flightNumber, returnView: 'roster', returnLabel: 'Voltar para Escala', policy: 'persistent-until-return' }); setView('departure'); }}");
}

export function repairHistoryReadSession(source) {
  for (const [before, after] of [
    ["import { authFetch, getStoredUser, getToken } from './authClient';", "import { authFetch, getStoredUser, getToken, captureAuthSession } from './authClient';"],
    ['export async function openRosterDisplayWindow(primary: CrewRoster): Promise<CrewRoster> {', 'export async function openRosterDisplayWindow(primary: CrewRoster): Promise<CrewRoster> {\n  const session = captureAuthSession();'],
    ['const summaries = await listSavedRosters(72).catch(() => getLocalRosterSummaries(72));', 'const summaries = await listSavedRosters(72, true).catch(() => session.isCurrent() ? getLocalRosterSummaries(72) : []);\n  if (!session.isCurrent()) return primary;'],
    ['const competence = await openDisplayCompetenceCandidate(primary, summary, ordinal, primaryCrew);', 'if (!session.isCurrent()) return primary;\n    const competence = await openDisplayCompetenceCandidate(primary, summary, ordinal, primaryCrew, session.isCurrent);\n    if (!session.isCurrent()) return primary;'],
    ['  primaryCrew: string,\n): Promise<CrewRoster | null> {', '  primaryCrew: string,\n  isCurrent: () => boolean,\n): Promise<CrewRoster | null> {'],
    ['  const preferredOpened = await openSavedRoster(preferred.id, preferred).catch(() => null);', '  const preferredOpened = await openSavedRoster(preferred.id, preferred).catch(() => null);\n  if (!isCurrent()) return null;'],
    ['  if (!localFallback) return null;', '  if (!isCurrent() || !localFallback) return null;'],
    ['  const localOpened = await openSavedRoster(localFallback.id, localFallback).catch(() => null);', '  const localOpened = await openSavedRoster(localFallback.id, localFallback).catch(() => null);\n  if (!isCurrent()) return null;'],
  ]) source = replaceOne(source, before, after);
  return source;
}
