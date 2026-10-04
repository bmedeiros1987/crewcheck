import crypto from 'node:crypto';

/** An idempotency key names one send operation, scoped to sender and conversation. */
export async function writeChatMessage(db, threadId, sender, message, requestId) {
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId))) {
    throw Object.assign(new Error('Identificador de envio inválido.'), { status: 400 });
  }
  const id = requestId ? crypto.createHash('sha256').update(JSON.stringify([threadId, sender, requestId])).digest('hex') : crypto.randomUUID();
  const existing = async () => {
    const result = await db.query('SELECT thread_id,sender_email,body FROM crewcheck_platform_chat_messages WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row) return false;
    if (row.thread_id !== threadId || row.sender_email !== sender || row.body !== message) {
      throw Object.assign(new Error('Este envio já foi utilizado para outra mensagem.'), { status: 409 });
    }
    return true;
  };
  if (requestId && await existing()) return { id };
  const recent = await db.query('SELECT COUNT(*) count FROM crewcheck_platform_chat_messages WHERE thread_id=$1 AND sender_email=$2 AND created_at>DATE_SUB(NOW(), INTERVAL 1 MINUTE)', [threadId, sender]);
  if (Number(recent.rows[0]?.count || 0) >= 20) throw Object.assign(new Error('Muitas mensagens em pouco tempo. Aguarde um minuto.'), { status: 429 });
  await db.query('INSERT INTO crewcheck_platform_chat_messages(id,thread_id,sender_email,body) VALUES($1,$2,$3,$4) ON DUPLICATE KEY UPDATE id=id', [id, threadId, sender, message]);
  await existing();
  return { id };
}
