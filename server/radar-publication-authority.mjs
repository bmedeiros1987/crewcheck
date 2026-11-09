import {findPublishedGateOccurrence, publishedGateDate} from '../shared/gate-query-day.mjs';
const crew = roster => String(roster?.crewId || roster?.registration || '').trim().toUpperCase();
const period = roster => `${Number(roster?.year)}-${String(Number(roster?.month)).padStart(2,'0')}`;
/** Current owner/competence rows only; never a client roster id or an archive version. */
export function resolveOwnedGatePublication(rows, email, request, canonical) {
  if (!Array.isArray(rows) || rows.length > 72 || typeof canonical !== 'function') return null;
  const parsed = [];
  for (const row of rows) {
    if (String(row.owner_email || '').trim().toLowerCase() !== email) return null;
    let roster = row.roster;
    if (typeof roster === 'string') { try { roster = JSON.parse(roster); } catch { return null; } }
    if (row.id == null || !Number.isFinite(Date.parse(String(row.updated_at || ''))) || !Array.isArray(roster?.days)) return null;
    const key = period(roster);
    if (!publishedGateDate(key + '-01') || row.roster_key !== key) return null;
    parsed.push({...row, roster, period:key});
  }
  const activeRows = parsed.filter(row => row.active === true || row.active === 1);
  if (activeRows.length !== 1 || !crew(activeRows[0].roster)) return null;
  const active = activeRows[0], identity = crew(active.roster);
  const owned = parsed.filter(row => crew(row.roster) === identity);
  // The table's owner+roster_key uniqueness is the current revision contract.
  // Unexpected duplicate competences fail closed rather than choosing old data.
  if (new Set(parsed.map(row => row.period)).size !== parsed.length) return null;
  const matches = [];
  for (const row of owned) {
    const occurrence = findPublishedGateOccurrence(row.roster, request, canonical(row.roster));
    if (!occurrence) continue;
    const nominal = owned.find(candidate => candidate.period === occurrence.publishedDate.slice(0,7));
    // A revised nominal publication removing this flight overrides older carry-in.
    if (nominal && nominal.id !== row.id) continue;
    matches.push(row);
  }
  if (matches.length !== 1) return null;
  const row = matches[0];
  return {roster:row.roster, ownerEmail:email, id:String(row.id),
    revision:JSON.stringify([String(row.updated_at),String(active.id),String(active.updated_at)])};
}
