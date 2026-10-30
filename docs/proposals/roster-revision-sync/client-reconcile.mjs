// PROPOSTA — reconciliação do aparelho, pura (sem rede, sem relógio, sem armazenamento próprio).
// Exercitada apenas por scripts/regression-roster-revision-sync-proposal.mjs e
// scripts/regression-roster-revision-reconcile-interleavings.mjs.
//
// Regra do Bruno: online o banco é a autoridade; offline vale o cache do aparelho; ao reconectar
// o aparelho compara gerações confiáveis e reconcilia, sem apagar importação pendente não enviada.
// Cada entrada é escopada por conta + tripulante (ID) + competência + tipo. Campos:
//  - synced:   última revisão confirmada pelo banco (cache), com sua geração;
//  - inflight: snapshot IMUTÁVEL do que foi enviado (operationId, base, conteúdo); só a resposta
//              com o mesmo operationId o resolve, e o resultado vale para ESSE snapshot;
//  - pending:  mudança local mais nova ainda não enviada. Criada durante um envio, fica encadeada
//              (after = operationId em voo) e recebe a base quando esse envio for confirmado;
//  - conflict: o banco mudou desde a base; nada é descartado sem escolha explícita;
//  - seen:     maior geração já observada (listagem, leitura ou ACK). Leitura ou ACK com geração
//              menor é obsoleto e ignorado: nunca rebaixa nem recria uma competência excluída.
// Nenhuma decisão usa createdAt, Date ou relógio do servidor.

export const entryKey = ({ accountId, crewKey, rosterKey, rosterKind = 'operated' }) => `${accountId}|${crewKey}|${rosterKey}|${rosterKind}`;
const identity = ({ accountId, crewKey, rosterKey, rosterKind = 'operated' }) => ({ accountId, crewKey, rosterKey, rosterKind });
const freeze = value => Object.freeze({ ...value });

export function entriesForAccount(store, accountId) {
  return Object.values(store.entries || {}).filter(entry => entry.accountId === accountId);
}

export function newEntry(ids) {
  return { ...identity(ids), seen: 0, discarded: [] };
}

function knownGeneration(entry) {
  return entry.synced ? entry.synced.generation : 0;
}

// A new local change. Base = the generation this device has confirmed; if a send is in flight the
// change is chained after it and gets its base when that exact send is acknowledged. While a
// conflict is open the newer change replaces the conflicting content and stays in conflict.
export function recordLocalChange(store, ids, { operation = 'import', roster = null, contentHash = null, operationId }) {
  const key = entryKey(ids), entries = { ...(store.entries || {}) };
  const entry = { ...(entries[key] || newEntry(ids)) };
  const change = { operation, operationId, contentHash, roster };
  if (entry.conflict) entry.conflict = { ...entry.conflict, pending: freeze({ ...change, baseGeneration: entry.conflict.pending.baseGeneration }), superseded: [...(entry.conflict.superseded || []), entry.conflict.pending] };
  else if (entry.inflight) entry.pending = freeze({ ...change, after: entry.inflight.operationId });
  else entry.pending = freeze({ ...change, baseGeneration: entry.pending?.baseGeneration ?? knownGeneration(entry) });
  entries[key] = entry;
  return { ...store, entries };
}

// Returns the immutable request to send (re-sends the same in-flight snapshot after a lost ACK).
export function beginSend(entry) {
  if (entry.inflight) return { entry, request: entry.inflight };
  if (!entry.pending || entry.pending.after) return { entry, request: null };
  const request = freeze({ ...entry.pending });
  return { entry: { ...entry, pending: undefined, inflight: request }, request };
}

// server: { generation, state, contentHash } from a COMPLETE listing, or null when not listed.
export function planReconcile(entry, server, { online, listingComplete }) {
  const local = entry?.pending || entry?.inflight ? 'pending' : entry?.synced && !entry.synced.deleted ? 'synced' : 'none';
  if (!online || (!server && !listingComplete)) return { action: 'none', display: entry?.conflict ? 'pending' : local, reason: online ? 'listing_incomplete' : 'offline' };
  const current = server || { generation: 0, state: 'absent', contentHash: null };
  // A listing older than what this device has already seen is obsolete: ignore it entirely.
  if (current.generation < (entry?.seen || 0)) return { action: 'none', display: local, reason: 'stale_read' };
  const serverDisplay = current.state === 'live' ? 'server' : 'none';
  if (entry?.conflict) return { action: 'none', display: serverDisplay, reason: 'conflict_open' };
  if (entry?.inflight || (entry?.pending && !entry.pending.after)) {
    const base = (entry.inflight || entry.pending).baseGeneration;
    const onBase = base === current.generation, deleting = (entry.inflight || entry.pending).operation === 'delete';
    return { action: 'send', display: onBase ? (deleting ? 'none' : 'pending') : serverDisplay, reason: onBase ? 'base_current' : 'server_moved' };
  }
  if (entry?.synced) {
    if (entry.synced.generation === current.generation) return { action: 'none', display: serverDisplay, reason: 'cache_current' };
    return { action: 'adopt_server', display: serverDisplay, reason: current.state === 'deleted' ? 'tombstone' : 'server_newer' };
  }
  return { action: current.state === 'live' ? 'adopt_server' : 'none', display: serverDisplay, reason: 'server_only' };
}

function settleChained(entry, operationId, generation) {
  if (!entry.pending?.after || entry.pending.after !== operationId) return entry;
  const { after, ...rest } = entry.pending;
  return { ...entry, pending: freeze({ ...rest, baseGeneration: generation }) };
}

// Adopts a database snapshot only if it is not older than what the device has seen.
export function adoptServer(entry, server, roster) {
  if (!server || server.generation < (entry.seen || 0) || (entry.synced && server.generation < entry.synced.generation)) return entry;
  const live = server.state === 'live';
  return { ...entry, seen: Math.max(entry.seen || 0, server.generation), synced: freeze({ generation: server.generation, contentHash: live ? server.contentHash : null, deleted: !live, roster: live ? roster : null }) };
}

// Applies the server's answer to THE request it answers. An answer for another operationId (late,
// duplicated or reordered) is ignored. status 0 = no response: the same snapshot is re-sent later.
export function applySendResult(entry, request, result) {
  if (!request || !entry.inflight || entry.inflight.operationId !== request.operationId) return entry;
  if (!result || !result.status) return entry;
  const sent = entry.inflight;
  let next = { ...entry, inflight: undefined };
  if (result.status === 200) {
    const generation = result.replay ? result.generation : result.current.generation;
    const deleted = sent.operation === 'delete';
    if (generation >= (next.seen || 0) && (!next.synced || generation >= next.synced.generation)) {
      const snapshot = result.unchanged ? result.current : { generation, state: deleted ? 'deleted' : 'live', contentHash: sent.contentHash };
      next = adoptServer(next, snapshot, deleted ? null : sent.roster);
    }
    return settleChained(next, sent.operationId, generation);
  }
  if (result.status === 409 && sent.operation === 'import' && result.current?.state === 'live' && result.current.contentHash === sent.contentHash) {
    // Same content already current: adopt the database; equality never authorises a write.
    next = adoptServer(next, result.current, sent.roster);
    return settleChained(next, sent.operationId, result.current.generation);
  }
  // Real conflict or refusal: the newest local intent is what the user decides on; the sent
  // snapshot is kept as superseded history. Nothing is dropped.
  const latest = next.pending ? freeze({ ...next.pending, after: undefined, baseGeneration: sent.baseGeneration }) : sent;
  const seen = Math.max(next.seen || 0, result.current?.generation || 0);
  return { ...next, pending: undefined, seen, conflict: { pending: latest, server: result.current || null, superseded: next.pending ? [sent] : [], ...(result.status === 409 ? {} : { rejected: result.code || `HTTP_${result.status}` }) } };
}

// Only an explicit choice closes a conflict.
//  keep_server: requires the database snapshot the user saw (with its roster) and adopts it, so an
//               older offline cache is never shown again; the local change is archived, recoverable.
//  keep_local:  re-bases the local change on the generation the user has just seen.
export function resolveConflict(entry, choice, { operationId, server, roster } = {}) {
  if (!entry.conflict) return entry;
  const { pending, superseded = [] } = entry.conflict;
  const seenServer = server || entry.conflict.server;
  if (choice === 'keep_server') {
    if (!seenServer) throw new Error('keep_server needs the database snapshot');
    if (seenServer.state === 'live' && roster === undefined) throw new Error('keep_server needs the database roster to adopt');
    const adopted = adoptServer({ ...entry, conflict: undefined, synced: undefined }, seenServer, roster ?? null);
    return { ...adopted, discarded: [...(entry.discarded || []), ...superseded, pending] };
  }
  if (choice === 'keep_local') {
    const base = Math.max(seenServer ? seenServer.generation : 0, entry.seen || 0);
    return { ...entry, conflict: undefined, discarded: [...(entry.discarded || []), ...superseded], pending: freeze({ ...pending, after: undefined, operationId, baseGeneration: base }) };
  }
  throw new Error('unknown conflict choice');
}
