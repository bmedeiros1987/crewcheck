import crypto from 'node:crypto';
import { cleanText, readBody, requireIdentity, sendJson } from '../v139/common.mjs';

function clientAddress(row) {
  return row ? {
    id: row.id,
    label: row.label,
    formattedAddress: row.formatted_address,
    postalCode: row.postal_code || '',
    latitude: row.latitude,
    longitude: row.longitude,
    updatedAt: row.updated_at,
  } : null;
}

export async function handleStayProfileRoute(req, res, url) {
  if (url.pathname !== '/api/platform/home-address') return false;
  const context = await requireIdentity(req, res);
  if (!context) return true;
  if (req.method === 'POST') {
    const body = await readBody(req, 200_000);
    const formattedAddress = cleanText(body.formattedAddress, 500);
    if (!formattedAddress) {
      sendJson(res, 400, { ok: false, message: 'Informe o endereço da residência.' });
      return true;
    }
    await context.db.query("UPDATE crewcheck_platform_addresses SET is_default=0 WHERE owner_email=? AND address_kind='home'", [context.email]);
    const [rows] = await context.db.query("SELECT id FROM crewcheck_platform_addresses WHERE owner_email=? AND address_kind='home' ORDER BY updated_at DESC LIMIT 1", [context.email]);
    const id = rows[0]?.id || crypto.randomUUID();
    if (rows[0]?.id) {
      await context.db.query(
        `UPDATE crewcheck_platform_addresses
         SET label=?,postal_code=?,formatted_address=?,latitude=?,longitude=?,is_default=1,metadata=?
         WHERE id=? AND owner_email=?`,
        [cleanText(body.label || 'Casa', 120), cleanText(body.postalCode, 20) || null, formattedAddress, Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null, Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null, JSON.stringify({ source: 'presentation-manager' }), id, context.email],
      );
    } else {
      await context.db.query(
        `INSERT INTO crewcheck_platform_addresses
         (id,owner_email,label,address_kind,postal_code,formatted_address,latitude,longitude,is_default,metadata)
         VALUES(?,?,?,'home',?,?,?,?,1,?)`,
        [id, context.email, cleanText(body.label || 'Casa', 120), cleanText(body.postalCode, 20) || null, formattedAddress, Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null, Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null, JSON.stringify({ source: 'presentation-manager' })],
      );
    }
  } else if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }
  const [addresses] = await context.db.query("SELECT * FROM crewcheck_platform_addresses WHERE owner_email=? AND address_kind='home' ORDER BY is_default DESC,updated_at DESC LIMIT 1", [context.email]);
  sendJson(res, 200, { ok: true, address: clientAddress(addresses[0]) });
  return true;
}
