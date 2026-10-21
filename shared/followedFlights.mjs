const airport = x => typeof x === 'string' && /^[A-Z]{3}$/.test(x);
export function followedFlight(value) {
  if (!value || typeof value.flight !== 'string' || !/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(value.flight) || !airport(value.origin) || !airport(value.destination) || value.origin === value.destination) return null;
  const instant = typeof value.scheduledDepartureUtc === 'string' ? Date.parse(value.scheduledDepartureUtc) : NaN;
  if (!Number.isFinite(instant) || !/Z$|[+-]\d{2}:\d{2}$/.test(value.scheduledDepartureUtc)) return null;
  const scheduledDepartureUtc = new Date(instant).toISOString();
  const date = typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date) ? value.date : '';
  if (!date || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date) return null;
  if (typeof value.eventId !== 'string' || !value.eventId.trim() || value.eventId.length > 500) return null;
  return {eventId:value.eventId,flight:value.flight,origin:value.origin,destination:value.destination,scheduledDepartureUtc,date};
}
export const followedFlightKey = value => { const flight=followedFlight(value); return flight ? JSON.stringify([flight.flight,flight.origin,flight.destination,flight.scheduledDepartureUtc]) : ''; };
export function readFollowedFlights(storage, owner) {
  if (typeof owner !== 'string' || !owner || owner === 'local') return [];
  try { const rows=JSON.parse(storage.getItem('crewcheck_followed_flights:v1:'+encodeURIComponent(owner)) || '[]');
    if (!Array.isArray(rows) || rows.length > 20) return [];
    const result=rows.map(followedFlight); if (result.some(x=>!x)) return [];
    return result.filter((x,i)=>result.findIndex(y=>followedFlightKey(y)===followedFlightKey(x))===i);
  } catch { return []; }
}
export function changeFollowedFlights(storage, owner, value, follow) {
  const item=followedFlight(value); if (!item || typeof owner !== 'string' || !owner || owner==='local' || typeof follow !== 'boolean') return false;
  const key=followedFlightKey(item), rows=readFollowedFlights(storage,owner).filter(x=>followedFlightKey(x)!==key);
  if (follow && rows.length>=20) return false;
  if (follow) rows.push(item);
  try { storage.setItem('crewcheck_followed_flights:v1:'+encodeURIComponent(owner),JSON.stringify(rows)); return true; } catch { return false; }
}
