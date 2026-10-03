import crypto from 'node:crypto';

// Lock existing profile rows in a fixed order; no migration, advisory lock or new table.
export async function withProfileLocks(db, emails, action) {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const email of [...new Set(emails)].sort()) {
        const found = await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [email]);
        if (!found.rows.length) throw Object.assign(new Error('Usuário não localizado.'), { status: 404 });
      }
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 1) continue;
      throw error;
    } finally { client.release(); }
  }
}

const rank = { accepted: 0, pending: 1, revoked: 2, declined: 3 };
export function canonicalConnections(rows) {
  const pairs = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.requester_email.toLowerCase(), row.target_email.toLowerCase()].sort());
    const previous = pairs.get(key);
    if (!previous || (rank[row.status] ?? 4) < (rank[previous.status] ?? 4)) pairs.set(key, row);
  }
  return [...pairs.values()];
}

export async function requestPeerConnection(db, requester, target, permissions, reinvite = false) {
  return withProfileLocks(db, [requester, target], async (client) => {
    const existing = await client.query('SELECT * FROM crewcheck_platform_connections WHERE (requester_email=$1 AND target_email=$2) OR (requester_email=$2 AND target_email=$1) ORDER BY updated_at DESC FOR UPDATE', [requester, target]);
    const row = canonicalConnections(existing.rows)[0];
    // A retry must never reactivate consent or overwrite existing permissions.
    if (row) {
      if (!reinvite || !['revoked', 'declined'].includes(row.status)) return { created: false, status: row.status, id: row.id, direction: row.requester_email === requester ? 'outgoing' : 'incoming' };
      const reusable = existing.rows.find((item) => item.requester_email === requester) || row;
      await client.query("UPDATE crewcheck_platform_connections SET requester_email=$2,target_email=$3,status='pending',permissions=$4,updated_at=NOW() WHERE id=$1", [reusable.id, requester, target, JSON.stringify(permissions)]);
      return { created: true, status: 'pending', id: reusable.id, direction: 'outgoing' };
    }
    const id = crypto.randomUUID();
    await client.query("INSERT INTO crewcheck_platform_connections(id,requester_email,target_email,status,permissions) VALUES($1,$2,$3,'pending',$4)", [id, requester, target, JSON.stringify(permissions)]);
    return { created: true, status: 'pending', id, direction: 'outgoing' };
  });
}

export async function answerPeerConnection(db, email, id, status) {
  if (!['accepted', 'declined', 'revoked'].includes(status)) throw Object.assign(new Error('Resposta inválida.'), { status: 400 });
  const lookup = await db.query('SELECT requester_email,target_email FROM crewcheck_platform_connections WHERE id=$1 AND (requester_email=$2 OR target_email=$2)', [id, email]);
  const peer = lookup.rows[0];
  if (!peer) throw Object.assign(new Error('Conexão não localizada.'), { status: 404 });
  if (status !== 'revoked' && peer.target_email !== email) throw Object.assign(new Error('Somente o destinatário pode responder ao convite.'), { status: 403 });
  return withProfileLocks(db, [peer.requester_email, peer.target_email], async (client) => {
    if (status === 'revoked') {
      // Explicit revocation also closes any legacy reversed duplicates; no rows are deleted.
      await client.query("UPDATE crewcheck_platform_connections SET status='revoked',updated_at=NOW() WHERE ((requester_email=$1 AND target_email=$2) OR (requester_email=$2 AND target_email=$1)) AND status<>'revoked'", [peer.requester_email, peer.target_email]);
    } else {
      await client.query("UPDATE crewcheck_platform_connections SET status=$3,updated_at=NOW() WHERE id=$1 AND target_email=$2 AND status='pending'", [id, email, status]);
    }
  });
}

export function publicRosterProjection(roster, permissions) {
  const pick = (source, keys) => Object.fromEntries(keys.filter((key) => ['string', 'number', 'boolean'].includes(typeof source?.[key])).map((key) => [key, source[key]]));
  const result = pick(roster, ['year', 'month', 'base']);
  const dayFields = ['date', 'data', 'type', 'pairingCode', 'activity'];
  const legFields = ['flightNumber', 'flight', 'origin', 'destination', 'departure', 'departureTime', 'arrival', 'arrivalTime', 'departureUtc', 'arrivalUtc', 'departureTimeUtc', 'arrivalTimeUtc'];
  if (permissions.hotels) dayFields.push('hotel', 'hotelName', 'accommodation');
  if (permissions.presentation) dayFields.push('presentation', 'hotelPresentation', 'reportTime', 'dutyReport');
  if (permissions.radar) { dayFields.push('gate', 'terminal', 'status'); legFields.push('gate', 'terminal', 'status'); }
  // Unknown fields, financial values, room and free-form private notes never pass through.
  result.days = permissions.roster && Array.isArray(roster?.days) ? roster.days.slice(0, 370).map((day) => ({
    ...pick(day, dayFields), legs: Array.isArray(day?.legs) ? day.legs.slice(0, 16).map((leg) => pick(leg, legFields)) : [],
  })) : [];
  return result;
}
