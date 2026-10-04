import { createHash } from 'node:crypto';

const MINUTE = 60_000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const privateChat = (value) => typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);
const account = (value) => {
  if (typeof value !== 'string' || value.length > 240) return '';
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
};
const time = (value) => typeof value === 'string' ? Date.parse(value) : NaN;
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

// This is a recipient selector, never an authentication credential. Configure it
// only after verifying and approving the exact account + private Telegram chat.
export function weatherCanaryRecipientHash(email, chatId) {
  const key = account(email);
  if (!key || !privateChat(chatId)) return '';
  return hash(`crewcheck-weather-canary:v1\0${key}\0${chatId}`);
}

export function weatherConsentCommand(text) {
  const command = typeof text === 'string' && text.match(/^\/(?:alertameteo|alertasmeteo)(?:@[A-Za-z0-9_]+)?\s+(on|off)\s*$/i);
  return command ? command[1].toLowerCase() : null;
}

function consentFields(value) {
  if (!object(value)) return null;
  return { version: value.version, chatId: value.chatId, linkedAt: value.linkedAt,
    bindingRevision: value.bindingRevision, grantedAt: value.grantedAt };
}
export function sameWeatherCanaryConsent(left, right) {
  if (!object(left) || !object(right)) return false;
  return left.weatherCriticalAlerts === right.weatherCriticalAlerts &&
    left.commandSequence === right.commandSequence && left.commandChatId === right.commandChatId &&
    left.channel === right.channel && JSON.stringify(consentFields(left.weatherCriticalAlertsConsent)) === JSON.stringify(consentFields(right.weatherCriticalAlertsConsent));
}
function canonical(value, depth = 0) {
  if (depth > 40) throw new Error('Unsupported weather snapshot depth');
  if (Array.isArray(value)) return value.map(item => canonical(item, depth + 1));
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key], depth + 1)]));
  return value;
}

// The sequence is Telegram's message_id from the verified webhook message, not
// request-body ownership/ordering. A delayed older command cannot undo a newer
// acknowledged opt-out, even across different application instances.
export async function writeWeatherCanaryConsent(pool, email, chatId, preference, commandSequence) {
  const key = account(email);
  if (!pool || !key || !privateChat(chatId) || !Number.isSafeInteger(commandSequence) || commandSequence <= 0 || !object(preference) || typeof preference.weatherCriticalAlerts !== 'boolean') return null;
  const record = { ...preference, commandSequence, commandChatId: chatId, channel: 'telegram' };
  let connection, transaction = false, reusable = true;
  try {
    connection = await pool.getConnection();
    await connection.query('BEGIN'); transaction = true;
    // Lock the same account rows removed by account deletion. Deletion after a
    // grant removes it; deletion before a delayed grant prevents recreation.
    const keys = [`link-email:${key}`, `link-chat:${chatId}`, `snapshot:${key}`, `weather-consent:${key}`].sort();
    const [rows] = await connection.query('SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key IN (?,?,?,?) ORDER BY state_key FOR UPDATE', keys);
    const records = new Map(rows.map(row => [row.state_key, typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload]));
    const currentBinding = binding(key, chatId, records.get(`link-email:${key}`), records.get(`link-chat:${chatId}`), Date.now());
    const snapshot = records.get(`snapshot:${key}`);
    const liveContext = currentBinding && snapshot?.key === key && account(snapshot.email) === key && snapshot.chatId === chatId;
    const consent = preference.weatherCriticalAlertsConsent;
    const allowed = preference.weatherCriticalAlerts
      ? liveContext && consent?.linkedAt === currentBinding.linkedAt && consent?.bindingRevision === currentBinding.revision && consent?.chatId === chatId
      : liveContext || records.has(`weather-consent:${key}`);
    if (!allowed) { await connection.query('ROLLBACK'); transaction = false; return null; }
    await connection.query(`INSERT INTO crewcheck_telegram_state (state_key, payload, updated_at) VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE
      updated_at=IF(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.commandChatId')), '') <> ? OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.commandSequence')) AS UNSIGNED), 0) < ?, NOW(), updated_at),
      payload=IF(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.commandChatId')), '') <> ? OR COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.commandSequence')) AS UNSIGNED), 0) < ?, VALUES(payload), payload)`,
    [`weather-consent:${key}`, JSON.stringify(record), chatId, commandSequence, chatId, commandSequence]);
    await connection.query('COMMIT'); transaction = false;
    return record;
  } catch {
    if (connection && transaction) { try { await connection.query('ROLLBACK'); } catch { reusable = false; } }
    return null;
  } finally {
    if (connection) { if (reusable) connection.release(); else connection.destroy(); }
  }
}

// Exact recipient lookup does not depend on the latest-250 roster listing.
// The digest is not an auth credential. Raw identifiers never leave the database.
export async function findWeatherCanarySnapshots(pool, recipientHash) {
  if (!pool || !/^[a-f0-9]{64}$/.test(recipientHash)) return [];
  try {
    const [rows] = await pool.query(`SELECT payload FROM crewcheck_telegram_state
      WHERE state_key LIKE 'snapshot:%'
      AND SHA2(CONCAT('crewcheck-weather-canary:v1', CHAR(0),
        LOWER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.email')))), CHAR(0),
        JSON_UNQUOTE(JSON_EXTRACT(payload, '$.chatId'))), 256) = ? LIMIT 2`, [recipientHash]);
    // Ambiguity is a blocker, never a reason to pick an arbitrary recipient.
    if (!Array.isArray(rows) || rows.length !== 1) return [];
    const value = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    return object(value) ? [value] : [];
  } catch { return []; }
}

// Named locks use the existing MySQL connection, require no table or migration,
// and serialize the canary across timer/manual calls and rolling app processes.
export async function acquireWeatherCanaryLease(pool, recipientHash) {
  if (!pool || !/^[a-f0-9]{64}$/.test(recipientHash)) return null;
  const lockName = `cc-wx-${recipientHash.slice(0, 58)}`;
  let connection;
  let released = false;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query({ sql: 'SELECT GET_LOCK(?, 0) AS acquired', values: [lockName], timeout: 3500 });
    if (Number(rows?.[0]?.acquired) !== 1) { connection.release(); return null; }
    return Object.freeze({
      async isHeld() {
        if (released) return false;
        try {
          const [current] = await connection.query({ sql: 'SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS owned', values: [lockName], timeout: 3500 });
          return Number(current?.[0]?.owned) === 1;
        } catch { return false; }
      },
      async release() {
        if (released) return;
        released = true;
        try {
          await connection.query({ sql: 'SELECT RELEASE_LOCK(?) AS released', values: [lockName], timeout: 3500 });
          connection.release();
        } catch { connection.destroy(); }
      },
    });
  } catch {
    if (connection) connection.destroy();
    return null;
  }
}

export function weatherMonitorSettings(env = {}) {
  const canaryFlag = env.CREWCHECK_WEATHER_MONITOR_CANARY_ENABLED;
  const canaryRequested = canaryFlag === 'true';
  const recipientHash = typeof env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256 === 'string'
    ? env.CREWCHECK_WEATHER_MONITOR_CANARY_RECIPIENT_SHA256 : '';
  const canaryTargetConfigured = /^[a-f0-9]{64}$/.test(recipientHash);
  const canaryConfigurationPresent = (canaryFlag !== undefined && canaryFlag !== '') || recipientHash !== '';
  const legacyRequested = String(env.CREWCHECK_WEATHER_MONITOR_ENABLED || 'false').toLowerCase() === 'true';
  const interval = Number(env.CREWCHECK_WEATHER_MONITOR_INTERVAL_MINUTES || 10);
  const intervalMinutes = Number.isFinite(interval) ? Math.min(30, Math.max(5, interval)) : 10;
  // A requested but malformed canary must never fall back to the broad audience.
  const mode = canaryConfigurationPresent
    ? canaryFlag === 'false' ? 'disabled' : canaryRequested && canaryTargetConfigured ? 'canary' : 'blocked'
    : legacyRequested ? 'legacy' : 'disabled';
  return Object.freeze({ mode, enabled: mode === 'canary' || mode === 'legacy',
    canaryRequested, canaryConfigurationPresent, canaryTargetConfigured, legacyRequested, intervalMinutes,
    recipientHash: canaryTargetConfigured ? recipientHash : '' });
}

// Call only inside the EXISTING authenticated weather-monitor health handler.
// Explicit field selection avoids returning env values, target digests or IDs.
export function weatherMonitorReadiness({ settings, schedulerSecretConfigured = false,
  telegramConfigured = false, telegramWebhookSecretConfigured = false, persistenceConfigured = false } = {}) {
  const mode = ['canary', 'legacy', 'blocked', 'disabled'].includes(settings?.mode) ? settings.mode : 'disabled';
  const enabled = settings?.enabled === true && ['canary', 'legacy'].includes(mode);
  const canarySourceProtected = mode !== 'canary' || telegramWebhookSecretConfigured === true;
  const prerequisites = schedulerSecretConfigured === true && telegramConfigured === true && persistenceConfigured === true && canarySourceProtected;
  return Object.freeze({ mode, schedulerEnabled: enabled && schedulerSecretConfigured === true && canarySourceProtected,
    canaryRequested: settings?.canaryRequested === true,
    canaryTargetConfigured: settings?.canaryTargetConfigured === true,
    legacyRequested: settings?.legacyRequested === true,
    intervalMinutes: Number.isFinite(settings?.intervalMinutes) ? settings.intervalMinutes : 10,
    schedulerSecretConfigured: schedulerSecretConfigured === true,
    telegramConfigured: telegramConfigured === true,
    telegramWebhookSecretConfigured: telegramWebhookSecretConfigured === true,
    persistenceConfigured: persistenceConfigured === true,
    configurationReady: enabled && prerequisites,
    deliveryVerified: false });
}

function binding(email, chatId, byEmail, byChat, now) {
  if (!account(email) || !privateChat(chatId) || !object(byEmail) || !object(byChat)) return null;
  const matches = (record) => account(record.email) === email && record.chatId === chatId;
  if (!matches(byEmail) || !matches(byChat)) return null;
  const linkedAt = time(byEmail.linkedAt);
  if (!Number.isFinite(linkedAt) || linkedAt > now || byEmail.linkedAt !== byChat.linkedAt) return null;
  if (typeof byEmail.code !== 'string' || !byEmail.code || byEmail.code !== byChat.code) return null;
  return { linkedAt: byEmail.linkedAt, revision: hash(`${byEmail.linkedAt}\0${byEmail.code}`) };
}

// Applied only to an explicit /alertameteo on|off command by its existing handler.
// Enabling requires both fresh DB link indexes; opt-out always remains possible.
export function weatherCanaryConsent({ enabled, profile, linkByEmail, linkByChat, now = Date.now() } = {}) {
  if (enabled === false) return { weatherCriticalAlerts: false, weatherCriticalAlertsConsent: null };
  const email = account(profile?.email);
  const chatId = profile?.chatId;
  if (enabled !== true || profile?.linked !== true || !Number.isFinite(now)) return null;
  const current = binding(email, chatId, linkByEmail, linkByChat, now);
  if (!current) return null;
  return { weatherCriticalAlerts: true, weatherCriticalAlertsConsent: {
    version: 1, chatId, linkedAt: current.linkedAt, bindingRevision: current.revision,
    grantedAt: new Date(now).toISOString(),
  } };
}

/** Default-off, read-only canary policy. It never schedules, writes or sends.
 * readRecord must read the current durable DB record, never the local JSON cache.
 * Caller supplies server-internal snapshots only and dispatches at most once after
 * canDispatch; already-submitted Telegram messages cannot be recalled.
 */
export function createWeatherCanaryPolicy({ enabled = false, recipientHash = '', readRecord, now = Date.now } = {}) {
  const configured = enabled === true && /^[a-f0-9]{64}$/.test(recipientHash) && typeof readRecord === 'function';

  async function current(candidate) {
    if (!configured) return null;
    const email = account(candidate?.email);
    const chatId = candidate?.chatId;
    if (!email || candidate?.key !== email || weatherCanaryRecipientHash(email, chatId) !== recipientHash) return null;
    try {
      const [snapshot, byEmail, byChat, weatherPreference] = await Promise.all([
        readRecord(`snapshot:${email}`), readRecord(`link-email:${email}`), readRecord(`link-chat:${chatId}`),
        readRecord(`weather-consent:${email}`),
      ]);
      const checkedAt = now();
      if (!Number.isFinite(checkedAt) || !object(snapshot) || snapshot.key !== email || account(snapshot.email) !== email || snapshot.chatId !== chatId) return null;
      const currentBinding = binding(email, chatId, byEmail, byChat, checkedAt);
      // This dedicated record is authoritative. Roster/location cache merges may
      // overwrite snapshot preferences; they can never restore revoked consent.
      const consent = weatherPreference?.weatherCriticalAlertsConsent;
      if (!currentBinding || weatherPreference?.weatherCriticalAlerts !== true || !object(consent) ||
          weatherPreference.channel !== 'telegram' || weatherPreference.commandChatId !== chatId || !Number.isSafeInteger(weatherPreference.commandSequence) || weatherPreference.commandSequence <= 0) return null;
      const grantedAt = time(consent.grantedAt);
      if (consent.version !== 1 || consent.chatId !== chatId || consent.linkedAt !== currentBinding.linkedAt || consent.bindingRevision !== currentBinding.revision || !Number.isFinite(grantedAt) || grantedAt < time(currentBinding.linkedAt) || grantedAt > checkedAt) return null;
      if (!object(snapshot.roster) || !Array.isArray(snapshot.roster.days) || !snapshot.roster.days.length) return null;
      const rosterUpdatedAt = time(snapshot.updatedAt);
      if (!Number.isFinite(rosterUpdatedAt) || rosterUpdatedAt > checkedAt || checkedAt - rosterUpdatedAt > 45 * 24 * 60 * MINUTE) return null;
      // Include the exact roster and consent used for evaluation. A concurrent
      // re-import, opt-out or link change invalidates the pending dispatch.
      const contextDigest = hash(JSON.stringify(canonical({ email, chatId, roster: snapshot.roster,
        consent: consentFields(consent), commandSequence: weatherPreference.commandSequence, updatedAt: snapshot.updatedAt, bindingRevision: currentBinding.revision })));
      return { snapshot: structuredClone(snapshot), consent: structuredClone(consent), commandSequence: weatherPreference.commandSequence, contextDigest };
    } catch { return null; }
  }

  return Object.freeze({
    async select(candidate) { return current(candidate); },
    async canDispatch(selection) {
      if (!selection || typeof selection.contextDigest !== 'string') return false;
      const fresh = await current(selection.snapshot);
      if (!fresh || fresh.contextDigest !== selection.contextDigest) return false;
      // Re-read authoritative consent last, after the link/roster checks. A
      // revocation after this check can still race submission to Telegram.
      try {
        const finalConsent = await readRecord(`weather-consent:${account(selection.snapshot.email)}`);
        return sameWeatherCanaryConsent(finalConsent, { weatherCriticalAlerts: true, channel: 'telegram',
          commandChatId: fresh.snapshot.chatId, commandSequence: fresh.commandSequence, weatherCriticalAlertsConsent: fresh.consent });
      } catch { return false; }
    },
  });
}
