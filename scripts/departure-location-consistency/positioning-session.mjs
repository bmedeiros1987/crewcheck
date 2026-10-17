import fs from 'node:fs';
const path = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes('// positioning-session-isolation')) {
  const edit = (a, b) => { if (!source.includes(a)) throw Error(`Positioning marker missing: ${a.slice(0, 70)}`); source = source.replace(a, b); };
  edit('type PositioningFlightRecord = {', 'type PositioningFlightRecord = {\n  contextId?: string;');
  edit('type PositioningSearchState = {', 'type PositioningSearchState = {\n  contextId?: string;');
  edit("const keys = [positioningEventKey(event), 'crewcheck_selected_positioning_flight'];", 'const keys = [positioningEventKey(event)];');
  const start = source.indexOf('function positioningEventKey('), end = source.indexOf('function positioningLocalIsoDate(', start);
  source = source.slice(0, start) + `// positioning-session-isolation
function positioningContext(event: ZeroLeg): string {
  return JSON.stringify([getStoredUser()?.id || null, event.id, event.origin, event.destination, event.presentation, event.departure, event.canonical?.startDateTime || '', eventRouteOrigin(event)]);
}
function positioningEventKey(event: ZeroLeg, contextId = positioningContext(event)): string {
  return 'crewcheck_positioning_flight:' + contextId;
}
function positioningSearchKey(event: ZeroLeg, contextId = positioningContext(event)): string {
  return 'crewcheck_positioning_search:' + contextId;
}
` + source.slice(end);
  edit("  if (!record || typeof record !== 'object') return false;", "  if (!record || typeof record !== 'object' || record.contextId !== positioningContext(event)) return false;");
  edit('  if (Number.isFinite(expiresAt) && expiresAt < Date.now()) return false;', '  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;');
  edit("    if (!parsed || parsed.eventId !== String(event.id || '')) return null;", "    if (!parsed || parsed.eventId !== String(event.id || '') || parsed.contextId !== positioningContext(event)) return null;");
  edit("function writePositioningSearch(event: ZeroLeg, state: Omit<PositioningSearchState, 'eventId'>): PositioningSearchState {\n  const value = { ...state, eventId: String(event.id || '') };\n  storage.set(positioningSearchKey(event), JSON.stringify(value));", "function writePositioningSearch(event: ZeroLeg, state: Omit<PositioningSearchState, 'eventId'>, contextId = positioningContext(event)): PositioningSearchState {\n  const value = { ...state, contextId, eventId: String(event.id || '') };\n  if (contextId !== positioningContext(event)) return value;\n  storage.set(positioningSearchKey(event, contextId), JSON.stringify(value));");
  edit("function savePositioningFlight(event: ZeroLeg, record: PositioningFlightRecord): PositioningFlightRecord {\n  storage.set(positioningEventKey(event), JSON.stringify(record));\n  storage.set('crewcheck_selected_positioning_flight', JSON.stringify(record));", "function savePositioningFlight(event: ZeroLeg, record: PositioningFlightRecord, contextId = positioningContext(event)): PositioningFlightRecord {\n  record = { ...record, contextId };\n  if (contextId !== positioningContext(event)) return record;\n  storage.set(positioningEventKey(event, contextId), JSON.stringify(record));");
  edit('destinationAirport: string): Promise<PositioningFlightRecord | null>', 'destinationAirport: string, isActive: () => boolean = () => true): Promise<PositioningFlightRecord | null>');
  const a = source.indexOf('async function discoverSameDayPositioningFlight('), b = source.indexOf('function monthlyMapDestinations(', a);
  let block = source.slice(a, b);
  block = block.replace('  const checkedAt = new Date();', `  const contextId = positioningContext(event);
  const searchKey = positioningSearchKey(event, contextId);
  const checkedAt = new Date();
  const stillCurrent = () => isActive() && contextId === positioningContext(event);
  const clearOwnPending = () => {
    try {
      const pending = JSON.parse(storage.get(searchKey, 'null'));
      if (pending?.contextId === contextId && pending.status === 'checking' && pending.checkedAt === checkedAt.toISOString()) storage.set(searchKey, '');
    } catch {}
  };
  const stopped = () => { if (stillCurrent()) return false; clearOwnPending(); return true; };`);
  block = block.replace("message: 'Consultando primeiro o cache econômico do Radar.',\n  });", "message: 'Consultando primeiro o cache econômico do Radar.',\n  }, contextId);");
  block = block.replace('    const board = await boardResponse.json().catch(() => null);', '    const board = await boardResponse.json().catch(() => null);\n    if (stopped()) return null;');
  block = block.replace('      const status = await response.json().catch(() => null);', '      const status = await response.json().catch(() => null);\n      if (stopped()) return null;');
  block = block.replace('    const selected = safeOptions.sort', '    if (stopped()) return null;\n    const selected = safeOptions.sort');
  block = block.replace('savePositioningFlight(event, selected);', 'savePositioningFlight(event, selected, contextId);');
  block = block.replace('source: selected.source,\n      });', 'source: selected.source,\n      }, contextId);');
  block = block.replace("source: String(board?.source || 'Radar CrewCheck'),\n    });", "source: String(board?.source || 'Radar CrewCheck'),\n    }, contextId);");
  block = block.replace('  } catch {\n    writePositioningSearch', '  } catch {\n    if (stopped()) return null;\n    writePositioningSearch');
  block = block.replace("message: 'Radar temporariamente indisponível. Mantido o planejamento seguro no dia anterior.',\n    });", "message: 'Radar temporariamente indisponível. Mantido o planejamento seguro no dia anterior.',\n    }, contextId);");
  source = source.slice(0, a) + block + source.slice(b);
  edit("discoverSameDayPositioningFlight(event, plan.originAirport.code, String(event.origin || ''))", "discoverSameDayPositioningFlight(event, plan.originAirport.code, String(event.origin || ''), () => alive)");
  fs.writeFileSync(path, source);
}
