// PROPOSTA — reconciliação do aparelho, pura (sem rede, sem relógio, sem armazenamento próprio).
// Exercitada apenas por scripts/regression-roster-revision-sync-proposal.mjs.
//
// Regra do Bruno: online o banco é a autoridade; offline vale o cache do aparelho; ao reconectar
// o aparelho compara gerações confiáveis e reconcilia, sem apagar importação pendente não enviada.
// Cada entrada é escopada por conta + tripulante (ID) + competência + tipo. Estados:
//  - synced:  última geração confirmada pelo banco (cache);
//  - pending: importação/exclusão local gravada ANTES do envio, com baseGeneration e operationId;
//  - conflict: o banco mudou desde a base do pendente; nada é descartado sem escolha explícita.
// Nenhuma decisão usa createdAt, Date ou relógio do servidor.

export const entryKey = ({ accountId, crewKey, rosterKey, rosterKind = 'operated' }) => `${accountId}|${crewKey}|${rosterKey}|${rosterKind}`;
const identity = ({ accountId, crewKey, rosterKey, rosterKind = 'operated' }) => ({ accountId, crewKey, rosterKey, rosterKind });

export function entriesForAccount(store, accountId) {
  return Object.values(store.entries || {}).filter(entry => entry.accountId === accountId);
}

function withEntry(store, ids, update) {
  const key = entryKey(ids), entries = { ...(store.entries || {}) };
  entries[key] = update(entries[key] ? { ...entries[key] } : { ...identity(ids), discarded: [] });
  return { ...store, entries };
}

function localBase(entry) {
  if (entry.conflict) return entry.conflict.pending.baseGeneration;
  if (entry.pending) return entry.pending.baseGeneration;
  return entry.synced ? entry.synced.generation : 0;
}

// A new local import keeps the base of whatever this device last knew. While a conflict is open the
// newer import replaces the conflicting content but stays in conflict until the user chooses.
export function recordLocalChange(store, ids, { operation = 'import', roster = null, contentHash = null, operationId }) {
  return withEntry(store, ids, entry => {
    const pending = { operation, operationId, baseGeneration: localBase(entry), contentHash, roster };
    if (entry.conflict) return { ...entry, conflict: { ...entry.conflict, pending } };
    return { ...entry, pending };
  });
}

// server: { generation, state, contentHash } from a COMPLETE account listing, or null when the
// competence is not listed. online=false or an incomplete listing => the device cache is used.
export function planReconcile(entry, server, { online, listingComplete }) {
  const local = entry?.pending ? 'pending' : entry?.synced && !entry.synced.deleted ? 'synced' : 'none';
  if (!online || (!server && !listingComplete)) return { action: 'none', display: entry?.conflict ? 'pending' : local, reason: online ? 'listing_incomplete' : 'offline' };
  const current = server || { generation: 0, state: 'absent', contentHash: null };
  const serverDisplay = current.state === 'live' ? 'server' : 'none';
  if (entry?.conflict) return { action: 'none', display: serverDisplay, reason: 'conflict_open' };
  if (entry?.pending) {
    // Always let the server judge a pending change (same operationId): it may already have been
    // committed before an ACK was lost (replay), or be a real conflict (409). The device never
    // guesses from hashes or base numbers alone.
    const onBase = entry.pending.baseGeneration === current.generation;
    return { action: 'send', display: onBase ? (entry.pending.operation === 'delete' ? 'none' : 'pending') : serverDisplay, reason: onBase ? 'base_current' : 'server_moved' };
  }
  if (entry?.synced) {
    if (entry.synced.generation === current.generation) return { action: 'none', display: serverDisplay, reason: 'cache_current' };
    if (entry.synced.generation < current.generation) return { action: 'adopt_server', display: serverDisplay, reason: current.state === 'deleted' ? 'tombstone' : 'server_newer' };
    return { action: 'adopt_server', display: serverDisplay, reason: 'integrity_cache_ahead' };
  }
  return { action: current.state === 'live' ? 'adopt_server' : 'none', display: serverDisplay, reason: 'server_only' };
}

export function markConflict(entry, server) {
  return { ...entry, pending: undefined, conflict: { pending: entry.pending, server } };
}

export function adoptServer(entry, server, roster) {
  return { ...entry, pending: undefined, synced: { generation: server.generation, contentHash: server.contentHash, deleted: server.state !== 'live', roster: server.state === 'live' ? roster : null } };
}

// status 0 = no response (offline, timeout, lost ACK): keep the pending change and its operationId,
// so the retry is recognised by the server as the same operation.
export function applySendResult(entry, result) {
  const pending = entry.pending;
  if (!result || !result.status) return entry;
  if (result.status === 200) {
    const generation = result.replay ? result.generation : result.current.generation;
    const deleted = pending.operation === 'delete';
    if (result.unchanged) return adoptServer(entry, result.current, pending.operation === 'import' ? pending.roster : null);
    return { ...entry, pending: undefined, synced: { generation, contentHash: deleted ? null : pending.contentHash, deleted, roster: deleted ? null : pending.roster } };
  }
  if (result.status === 409) {
    // Same content already current: adopt the database; equality never authorises a write.
    if (pending.operation === 'import' && result.current?.state === 'live' && result.current.contentHash === pending.contentHash) return adoptServer(entry, result.current, pending.roster);
    return markConflict(entry, result.current);
  }
  return { ...entry, pending: undefined, conflict: { pending, server: result.current || null, rejected: result.code || `HTTP_${result.status}` } };
}

// Only an explicit choice closes a conflict. "keep_server" archives the local change (still
// recoverable); "keep_local" re-bases it on the server generation the user has just seen.
export function resolveConflict(entry, choice, operationId) {
  if (!entry.conflict) return entry;
  const { pending, server } = entry.conflict;
  if (choice === 'keep_server') return { ...entry, conflict: undefined, discarded: [...(entry.discarded || []), pending] };
  if (choice === 'keep_local') return { ...entry, conflict: undefined, pending: { ...pending, operationId, baseGeneration: server ? server.generation : 0 } };
  throw new Error('unknown conflict choice');
}
