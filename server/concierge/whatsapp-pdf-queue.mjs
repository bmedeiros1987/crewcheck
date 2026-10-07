import crypto from 'node:crypto';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const identity = link => JSON.stringify([String(link?.email || '').trim().toLowerCase(), String(link?.linked_at || '')]);
const active = link => Boolean(link?.email && link.linked_at && !link.revoked_at && Number(link.consent_concierge) === 1);
const error = code => Object.assign(new Error(code), { code });
const keyOf = message => `whatsapp-pdf-job:${digest(JSON.stringify([message.phoneNumberId, message.id]))}`;

// Existing JSON state table only. Enqueue is durable before webhook ACK.
export async function enqueuePdfJob(pool, message, deps) {
  if (!pool?.getConnection) throw error('PDF_QUEUE_UNAVAILABLE');
  if (!deps.receiver() || message.type !== 'document' || message.phoneNumberId !== deps.receiver() || !message.id || !/^\d{8,16}$/.test(String(message.from))) return { queued: false };
  if (!/^\d{1,80}$/.test(String(message.document?.id)) || message.document?.mime_type !== 'application/pdf') return { queued: false };
  const phoneHash = deps.phoneHash(message.from), phoneCipher = deps.encryptPhone(message.from);
  if (!phoneHash || !phoneCipher) throw error('PDF_QUEUE_IDENTITY_UNAVAILABLE');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [links] = await connection.query('SELECT email,linked_at,revoked_at,consent_concierge FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash]);
    const link = links[0];
    if (!active(link) || message.phoneNumberId !== deps.receiver()) { await connection.rollback(); return { queued: false }; }
    const key = keyOf(message);
    const job = { stage: 'queued', attempts: 0, receivedAt: deps.now().toISOString(), retryAt: 0, binding: identity(link), phoneCipher,
      message: { id: String(message.id).slice(0, 191), phoneNumberId: message.phoneNumberId, type: 'document', timestamp: String(message.timestamp || '').slice(0, 16), document: message.document } };
    const [result] = await connection.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?)', [key, JSON.stringify(job)]);
    await connection.commit();
    return { queued: Number(result.affectedRows) === 1, duplicate: Number(result.affectedRows) === 0, key };
  } catch (failure) { await connection.rollback().catch(() => {}); throw failure; }
  finally { connection.release(); }
}

export async function runPdfJobs(pool, deps) {
  if (!pool?.query || !deps.enabled()) return [];
  const [rows] = await pool.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'whatsapp-pdf-job:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.stage')) IN ('queued','processing') ORDER BY updated_at LIMIT 10");
  const outcomes = [];
  for (const row of rows) {
    if (!deps.enabled()) break;
    const previous = parse(row.payload), now = deps.now().getTime();
    if (Number(previous.retryAt || 0) > now || (previous.stage === 'processing' && Number(previous.leaseUntil || 0) > now)) continue;
    const job = { ...previous, stage: 'processing', lease: crypto.randomUUID(), leaseUntil: now + 90_000, attempts: Number(previous.attempts || 0) + 1 };
    const [claim] = await pool.query('UPDATE crewcheck_telegram_state SET payload=CAST(? AS JSON),updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=? AND payload=CAST(? AS JSON)', [JSON.stringify(job), row.state_key, JSON.stringify(previous)]);
    if (Number(claim.affectedRows) !== 1) continue;
    let result;
    try {
      const from = deps.decryptPhone(job.phoneCipher);
      const link = from && await deps.findLink(from);
      if (!from || !active(link) || identity(link) !== job.binding || job.message.phoneNumberId !== deps.receiver()) result = { ok: false, reason: 'binding_changed' };
      else result = await deps.importPdf({ ...job.message, from, receivedAt: job.receivedAt, timestamp: job.message.timestamp, expectedBinding: job.binding });
    } catch { result = { ok: false, reason: 'import_failed' }; }
    const terminal = result?.ok || ['binding_changed','not_authorized','invalid_envelope','roster_empty','stale_document'].includes(result?.reason) || job.attempts >= 3;
    // Terminal records deliberately discard media and encrypted addresses.
    const next = terminal
      ? { stage: result?.ok ? 'completed' : 'failed', attempts: job.attempts, reason: result?.ok ? 'imported' : String(result?.reason || 'import_failed'), receivedAt: job.receivedAt }
      : { ...job, stage: 'queued', lease: '', leaseUntil: 0, retryAt: now + job.attempts * 30_000 };
    const [finished] = await pool.query('UPDATE crewcheck_telegram_state SET payload=CAST(? AS JSON),updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=? AND payload=CAST(? AS JSON)', [JSON.stringify(next), row.state_key, JSON.stringify(job)]);
    outcomes.push({ key: row.state_key, ...result });
    if (Number(finished.affectedRows) === 1 && terminal && !result.duplicate && !['binding_changed','not_authorized','invalid_envelope'].includes(result?.reason) && deps.enabled()) {
      const from = deps.decryptPhone(job.phoneCipher), linked = from && await deps.findLink(from);
      const sentAt = /^\d{10,11}$/.test(String(job.message.timestamp || '')) ? Number(job.message.timestamp) * 1000 : NaN;
      if (active(linked) && identity(linked) === job.binding && job.message.phoneNumberId === deps.receiver() && Number.isFinite(sentAt) && now >= sentAt && now - sentAt < 23 * 60 * 60 * 1000) {
        await deps.confirm(from, job.message.id, job.message.phoneNumberId, result).catch(() => {});
      }
    }
  }
  return outcomes;
}

// No file fallback in PDF mode. The pure builder remains the canonical producer.
export async function readDurableSnapshot(pool, key) {
  if (!pool?.query) throw error('PDF_SNAPSHOT_DB_UNAVAILABLE');
  const [rows] = await pool.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? LIMIT 1', [`snapshot:${key}`]);
  return rows[0] ? parse(rows[0].payload) : null;
}
export async function writeDurableSnapshot(pool, key, builder) {
  if (!pool?.getConnection) throw error('PDF_SNAPSHOT_DB_UNAVAILABLE');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Establish a common lock even when the snapshot has never existed.
    await connection.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?)', [`snapshot:${key}`, '{}']);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [`snapshot:${key}`]);
    const snapshot = builder(parse(rows[0]?.payload) || {});
    await connection.query('UPDATE crewcheck_telegram_state SET payload=CAST(? AS JSON),updated_at=CURRENT_TIMESTAMP(3) WHERE state_key=?', [JSON.stringify(snapshot), `snapshot:${key}`]);
    await connection.commit(); return snapshot;
  } catch (failure) { await connection.rollback().catch(() => {}); throw failure; }
  finally { connection.release(); }
}

export async function seedDurableSnapshot(pool, key, seed) {
  if (!pool?.getConnection) throw error('PDF_SNAPSHOT_DB_UNAVAILABLE');
  if (!seed || seed.email !== key || !seed.roster?.days?.length || seed.whatsappPdfImport || seed.durableWhatsAppPdf) return null;
  return writeDurableSnapshot(pool, key, previous => {
    if (previous.durableWhatsAppPdf || previous.whatsappPdfImport || (previous.roster?.days?.length && Date.parse(previous.updatedAt || '') >= Date.parse(seed.updatedAt || ''))) return previous;
    return { ...seed, durableWhatsAppPdf: true };
  });
}
