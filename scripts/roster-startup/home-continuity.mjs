/** Reuse the publication/session-fenced display history for HOME's date-scoped consumers. */
export function repairHomeContinuity(source) {
  const before = '<Cockpit events={events}';
  const old = '<Cockpit events={rosterEvents}';
  const after = '<Cockpit events={homeOperationalEvents} displayEvents={rosterEvents} conflictDates={homeOperationalProjection.conflictDates}';
  if (!source.includes('rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster')) {
    throw new Error('HOME continuity requires the session-fenced roster window');
  }
  if (source.includes(after)) return source;
  const consumer = source.includes(old) ? old : before;
  if (source.split(consumer).length !== 2) throw new Error('HOME continuity: unique Cockpit consumer missing');
  source = source.replace(consumer, after);
  source = "import { homeOperationalRoster } from '@/lib/homeOperationalRoster';\n" + source;
  const anchor = '  const rosterEvents = useMemo(() => buildLegs(rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster), [rosterWindow, bundle.roster]);';
  if (!source.includes(anchor)) throw new Error('HOME operational authority: window producer missing');
  source = source.replace(anchor, anchor + `
  const homeOperationalProjection = useMemo(() => homeOperationalRoster(bundle.roster, rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster), [bundle.roster, rosterWindow]);
  const homeOperationalEvents = useMemo(() => buildLegs(homeOperationalProjection.roster), [homeOperationalProjection]);`);
  for (const name of ['Cockpit', 'PersonalizedCockpit']) {
    const signature = 'function ' + name + '({ events, ';
    if (source.split(signature).length !== 2) throw new Error('HOME authority: consumer signature missing: ' + name);
    source = source.replace(signature, 'function ' + name + '({ events, displayEvents = events, conflictDates = [], ');
    const begin = source.indexOf('function ' + name + '(');
    const type = source.indexOf('events: ZeroLeg[];', begin);
    if (type < begin) throw new Error('HOME authority: consumer type missing');
    source = source.slice(0, type) + source.slice(type).replace('events: ZeroLeg[];', 'events: ZeroLeg[]; displayEvents?: ZeroLeg[]; conflictDates?: string[];');
  }
  const wrappers = '<PersonalizedCockpit events={events}';
  if (source.split(wrappers).length !== 4) throw new Error('HOME authority: expected three layout branches');
  source = source.replaceAll(wrappers, wrappers + ' displayEvents={displayEvents} conflictDates={conflictDates}');
  const preview = '<HomeRosterPreview events={events} onNavigate={setView}/>';
  if (source.split(preview).length !== 2) throw new Error('HOME authority: preview consumer missing');
  return source.replace(preview, '<HomeRosterPreview events={displayEvents} operationalEvents={events} conflictDates={conflictDates} onNavigate={setView}/>');
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
