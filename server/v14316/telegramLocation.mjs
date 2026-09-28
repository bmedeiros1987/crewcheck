import { dbPool } from '../v139/common.mjs';

// Compatibilidade temporária de persistência para instalações que ainda leem a
// tabela histórica. Este módulo não decide localização, não aplica TTL e não
// responde consultas. O Concierge canônico é a única camada autorizada a isso.
async function ensureLocationTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_telegram_locations (
    chat_id VARCHAR(120) NOT NULL PRIMARY KEY,
    latitude DOUBLE NOT NULL,
    longitude DOUBLE NOT NULL,
    accuracy DOUBLE NULL,
    source VARCHAR(30) NOT NULL DEFAULT 'telegram',
    live_until DATETIME(3) NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function saveLegacyLocationMirror(message, isEdited = false) {
  const chatId = String(message?.chat?.id || '').trim();
  const latitude = Number(message?.location?.latitude);
  const longitude = Number(message?.location?.longitude);
  if (!chatId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const db = await dbPool();
  if (!db) return false;
  await ensureLocationTable(db);

  const livePeriod = Math.max(0, Number(message?.location?.live_period || 0));
  const source = 'telegram';
  const liveUntil = livePeriod
    ? new Date((Number(message?.date || Math.floor(Date.now() / 1000)) + livePeriod) * 1000)
    : null;

  await db.query(`INSERT INTO crewcheck_telegram_locations
    (chat_id,latitude,longitude,accuracy,source,live_until) VALUES (?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE latitude=VALUES(latitude),longitude=VALUES(longitude),accuracy=VALUES(accuracy),source=VALUES(source),live_until=VALUES(live_until),updated_at=UTC_TIMESTAMP(3)`,
  [chatId, latitude, longitude, Number(message?.location?.horizontal_accuracy || 0) || null, source, liveUntil]);

  const state = {
    latitude,
    longitude,
    source,
    liveUntil: liveUntil?.toISOString() || '',
    updatedAt: new Date().toISOString(),
    compatibilityMirror: true,
    edited: Boolean(isEdited),
  };
  await db.query(`INSERT INTO crewcheck_telegram_state (state_key,payload) VALUES (?,?)
    ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=UTC_TIMESTAMP(3)`,
  [`location-chat:${chatId}`, JSON.stringify(state)]).catch(() => undefined);
  return true;
}

export async function handleTelegramLocationAndPlaces(update = {}, options = {}) {
  const edited = update?.edited_message;
  const message = update?.message || edited || update;
  if (!message?.location) return false;

  // Espelha silenciosamente para compatibilidade, mas retorna false para que a
  // mesma atualização continue até o handler canônico. Academias, farmácias,
  // hospitais, rotas e qualquer outro consumidor usam a mesma localização.
  await saveLegacyLocationMirror(message, Boolean(edited)).catch(() => false);
  void options;
  return false;
}
