import crypto from 'node:crypto';
import { parseJsonColumn } from './common.mjs';

// Durable tombstones in the existing state store prevent deleted create requests replaying.
export const bidsCreationKey = (email, id) => `bids-create:${crypto.createHash('sha256').update(JSON.stringify([email, id])).digest('hex')}`;
export async function withBidsCreation(db, email, id, action, mutate) {
  const connection = await db.getConnection();
  const key = bidsCreationKey(email, id);
  try {
    await connection.beginTransaction();
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key', [key, JSON.stringify({ email, id, deleted: false })]);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
    const state = parseJsonColumn(rows[0]?.payload, {});
    if (action === 'create' && state.deleted === true) throw Object.assign(new Error('Esta janela foi removida; a criação antiga não pode ser repetida.'), { status: 409 });
    const result = await mutate(connection);
    if (action === 'delete' && result.affectedRows) await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify({ email, id, deleted: true }), key]);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
