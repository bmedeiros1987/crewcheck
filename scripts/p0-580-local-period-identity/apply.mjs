import fs from 'node:fs';

const path = 'client/src/lib/databaseClient.ts';
if (!fs.existsSync(path)) throw new Error('[p0-580-local-period-identity] databaseClient.ts ausente');

let source = fs.readFileSync(path, 'utf8');

const oldIdentity = `function localRosterPeriodIdentity(roster: CrewRoster): string {
  const crew = String(roster.crewId || roster.crewName || 'crew').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || 'crew';
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  return \`${'${crew}:${year}:${month}'}\`;
}`;

const newIdentity = `function localRosterPeriodIdentity(roster: CrewRoster): string | null {
  // P0_580_LOCAL_PERIOD_IDENTITY_GUARD: use the same verifiable crew identity
  // policy as openSavedRoster/history lookup. Generic/default/empty identities
  // cannot authorize replacement of another publication in the same competence.
  const crew = crewIdentityToken(roster);
  if (!crew) return null;
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  return \`${'${crew}:${year}:${month}'}\`;
}`;

if (source.includes(oldIdentity)) source = source.replace(oldIdentity, newIdentity);
else if (!source.includes('P0_580_LOCAL_PERIOD_IDENTITY_GUARD')) throw new Error('[p0-580-local-period-identity] função localRosterPeriodIdentity não localizada');

const revisionHelper = `function localRosterRevisionChecksum(roster: CrewRoster, periodIdentity: string): string {
  // MOBILE_ACTIVE_ROSTER_REVISION_GUARD: the verified period owns the slot, while
  // the content suffix distinguishes later corrections published for that month.
  const text = JSON.stringify({ year: roster.year, month: roster.month, crewId: roster.crewId, days: roster.days });
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return \`${'${periodIdentity}:${(hash >>> 0).toString(16).padStart(8, \'0\')}'}\`;
}`;
if (!source.includes('function localRosterRevisionChecksum(roster: CrewRoster, periodIdentity: string): string {')) {
  const anchor = 'function persistRosterHistoryLocally(payload: SaveRosterPayload): SavedRosterSummary {';
  if (!source.includes(anchor)) throw new Error('[p0-580-local-period-identity] persistência local não localizada para revision checksum');
  source = source.replace(anchor, `${revisionHelper}\n${anchor}`);
}

const oldPersistHead = `  const periodIdentity = localRosterPeriodIdentity(roster);
  const previousItems = readLocalHistory();
  const previous = previousItems.find((item) => localRosterPeriodIdentity(item.roster) === periodIdentity) || null;
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  const now = new Date().toISOString();
  const item: LocalHistoryItem = {`;

const newPersistHead = `  const periodIdentity = localRosterPeriodIdentity(roster);
  const previousItems = readLocalHistory();
  // Unverifiable crew identity is not evidence that two publications belong to
  // the same person. Preserve both instead of replacing one by nominal month.
  const previous = periodIdentity
    ? previousItems.find((item) => localRosterPeriodIdentity(item.roster) === periodIdentity) || null
    : null;
  const year = String(Number(roster.year) || '0000');
  const month = String(Number(roster.month) || 0).padStart(2, '0');
  const now = new Date().toISOString();
  const identitySlug = localRosterIdentitySlug(roster);
  const item: LocalHistoryItem = {`;

if (source.includes(oldPersistHead)) source = source.replace(oldPersistHead, newPersistHead);
else if (!source.includes('const identitySlug = localRosterIdentitySlug(roster);')) throw new Error('[p0-580-local-period-identity] cabeça de persistência não localizada');

const oldItem = `    id: previous?.id || \`local-\${safeStorageScope()}-\${localRosterIdentitySlug(roster)}-\${year}-\${month}\`,
    checksum: String(payload.checksum || periodIdentity),`;
const mobileRevisionItem = `    id: previous?.id || \`local-\${safeStorageScope()}-\${localRosterIdentitySlug(roster)}-\${year}-\${month}\`,
    checksum: String(payload.checksum || localRosterContentChecksum(roster)),`;
const newItem = `    id: previous?.id || \`local-\${safeStorageScope()}-\${identitySlug}-\${year}-\${month}\`,
    checksum: String(payload.checksum || (periodIdentity ? localRosterRevisionChecksum(roster, periodIdentity) : \`unverified:\${identitySlug}:\${year}:\${month}:\${now}\`)),`;
if (source.includes(oldItem)) source = source.replace(oldItem, newItem);
else if (source.includes(mobileRevisionItem)) source = source.replace(mobileRevisionItem, newItem);
else if (!source.includes('periodIdentity ? localRosterRevisionChecksum(roster, periodIdentity)')) throw new Error('[p0-580-local-period-identity] identidade do item não localizada');

const oldMerge = `    ...previousItems.filter((candidate) => localRosterPeriodIdentity(candidate.roster) !== periodIdentity),`;
const newMerge = `    ...previousItems.filter((candidate) => !periodIdentity || localRosterPeriodIdentity(candidate.roster) !== periodIdentity),`;
if (source.includes(oldMerge)) source = source.replace(oldMerge, newMerge);
else if (!source.includes('!periodIdentity || localRosterPeriodIdentity(candidate.roster) !== periodIdentity')) throw new Error('[p0-580-local-period-identity] filtro de merge não localizado');

// saveRosterAnalysis has always been local-first/offline-friendly. The Mobile retry
// loop below reads unsynced local history directly, so a 5xx must not turn a durable
// local import into a rejected user action or break P0_580's existing offline contract.
const mobileCloudThrow = `  } catch (error) {
    (error as any).localSummary = localSummary;
    throw error;
  }`;
const offlineLocalSuccess = `  } catch {
    return localSummary;
  }`;
if (source.includes(mobileCloudThrow)) source = source.replace(mobileCloudThrow, offlineLocalSuccess);
if (!source.includes(offlineLocalSuccess)) throw new Error('[p0-580-local-period-identity] contrato local-first offline ausente');

fs.writeFileSync(path, source, 'utf8');
console.log('[p0-580-local-period-identity] applied with Mobile revision-aware checksum and offline-local save compatibility.');
