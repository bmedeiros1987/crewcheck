import crypto from 'node:crypto';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,160}$/.test(value);
const supported = host => host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host === 'wns2-par02p.notify.windows.com' || host.endsWith('.notify.windows.com');
export function validateSubscription(value) {
  let url; try { url = new URL(value?.endpoint); } catch { fail('Inscrição inválida.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !supported(url.hostname) || url.href.length > 4096) fail('Serviço de notificações não aceito.');
  const decode = (key, length) => {
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(key)) fail('Inscrição inválida.');
    const bytes = Buffer.from(key, 'base64url'); if (bytes.length !== length || bytes.toString('base64url') !== key) fail('Inscrição inválida.'); return bytes;
  };
  const publicKey = decode(value?.keys?.p256dh, 65); if (publicKey[0] !== 4) fail('Inscrição inválida.');
  try { crypto.ECDH.convertKey(publicKey, 'prime256v1'); } catch { fail('Inscrição inválida.'); }
  decode(value?.keys?.auth, 16);
  return { endpoint: url.href, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth } };
}
export const installationBindingKey=(ownerId,installationId)=>`crewcheck-push-binding:${crypto.createHash('sha256').update(JSON.stringify([ownerId,installationId])).digest('hex')}`;
export const installationStateKey = endpoint => `crewcheck-push-installation:${crypto.createHash('sha256').update(endpoint).digest('hex')}`;
function encryptionKey(key) { if (!Buffer.isBuffer(key) || key.length !== 32) fail('Proteção das inscrições ainda não configurada.', 503); return key; }
export function sealSubscription(value, key, binding) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(JSON.stringify(binding)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') };
}
export function openSubscription(value, key, binding) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(value.iv, 'base64url'));
  decipher.setAAD(Buffer.from(JSON.stringify(binding))); decipher.setAuthTag(Buffer.from(value.tag, 'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64url')), decipher.final()]).toString());
}
export function changeInstallation({ previous, identity, installationId, expectedRevision, action, consent, subscription, key, now }) {
  if (!identifier(identity?.ownerId) || !identity.email || !identifier(installationId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !Number.isFinite(now)) fail('Conta ou aparelho não verificados.');
  if (previous && (previous.ownerId !== identity.ownerId || previous.email !== identity.email || previous.installationId !== installationId)) fail('Este vínculo pertence a outra conta ou aparelho.', 409);
  if ((previous?.revision || 0) !== expectedRevision) fail('O vínculo mudou. Recarregue antes de confirmar.', 409);
  if (action === 'revoke') return { email: identity.email, ownerId: identity.ownerId, installationId, revision: expectedRevision + 1, active: false, revokedAt: new Date(now).toISOString(), sealed: null };
  if (action !== 'subscribe' || consent !== true) fail('Ativação exige confirmação explícita.');
  const checked = validateSubscription(subscription), revision = expectedRevision + 1;
  const binding = [identity.ownerId, installationId, revision];
  return { email: identity.email, ownerId: identity.ownerId, installationId, revision, active: true, createdAt: new Date(now).toISOString(), sealed: sealSubscription(checked, key, binding) };
}

// Existing MySQL state table, no new infrastructure. Callers must authenticate the
// canonical account first. Every write locks the current profile and endpoint row.
export async function mutateInstallation(db, input) {
  const checked = validateSubscription(input.subscription), stateKey = installationStateKey(checked.endpoint), connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [input.identity.email]);
    if (owners[0]?.public_id !== input.identity.ownerId) fail('Sessão da conta não é mais válida.', 401);
    const bindingKey=installationBindingKey(input.identity.ownerId,input.installationId);
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key',[bindingKey,'null']);
    const[bindingRows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[bindingKey]);
    const binding=typeof bindingRows[0]?.payload==='string'?JSON.parse(bindingRows[0].payload):bindingRows[0]?.payload;
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key', [stateKey, 'null']);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [stateKey]);
    const previous = typeof rows[0]?.payload === 'string' ? JSON.parse(rows[0].payload) : rows[0]?.payload;
    if(previous&&(previous.ownerId!==input.identity.ownerId||previous.email!==input.identity.email||previous.installationId!==input.installationId))fail('Este vínculo pertence a outra conta ou aparelho.',409);
    const next = changeInstallation({ ...input, subscription: checked, previous:binding });
    if(binding?.endpointKey&&binding.endpointKey!==stateKey){const[oldRows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[binding.endpointKey]);const old=typeof oldRows[0]?.payload==='string'?JSON.parse(oldRows[0].payload):oldRows[0]?.payload;if(old?.ownerId!==input.identity.ownerId||old.installationId!==input.installationId)fail('Vínculo anterior não verificado.',409);await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({...old,active:false,sealed:null}),binding.endpointKey]);}
    await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({email:next.email,ownerId:next.ownerId,installationId:next.installationId,revision:next.revision,active:next.active,endpointKey:stateKey}),bindingKey]);
    await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(next), stateKey]);
    await connection.commit(); return { installationId: next.installationId, revision: next.revision, active: next.active, received: null };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}

// Works even when the browser has already lost/unsubscribed its subscription.
export async function revokeAccountInstallations(db, identity, installationId, now) {
  if (!identifier(identity?.ownerId) || !identity.email || !identifier(installationId) || !Number.isFinite(now)) fail('Conta ou aparelho não verificados.');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [identity.email]);
    if (owners[0]?.public_id !== identity.ownerId) fail('Sessão da conta não é mais válida.', 401);
    const bindingKey=installationBindingKey(identity.ownerId,installationId),[bindingRows]=await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[bindingKey]);const binding=typeof bindingRows[0]?.payload==='string'?JSON.parse(bindingRows[0].payload):bindingRows[0]?.payload;
    const [rows] = await connection.query("SELECT state_key,payload FROM crewcheck_telegram_state WHERE state_key LIKE 'crewcheck-push-installation:%' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.email'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.ownerId'))=? AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.installationId'))=? FOR UPDATE", [identity.email, identity.ownerId, installationId]);
    let revoked = 0;
    for (const row of rows) {
      const previous = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      if (previous?.email !== identity.email || previous.ownerId !== identity.ownerId || previous.installationId !== installationId || previous.active !== true) continue;
      const next = changeInstallation({ previous, identity, installationId, expectedRevision: previous.revision, action: 'revoke', now });
      await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(next), row.state_key]); revoked++;
    }
    if(binding&&binding.ownerId===identity.ownerId&&binding.installationId===installationId&&binding.active===true)await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?',[JSON.stringify({...binding,active:false,revision:binding.revision+1}),bindingKey]);
    await connection.commit(); return { revoked, active: false, received: null };
  } catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
}
