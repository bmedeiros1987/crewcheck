import crypto from 'node:crypto';
import { cleanText, env, flag, readBody, requireIdentity, sendJson, sha256 } from './common.mjs';

const ALLOWED_MIME = new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);

function cloudinaryConfig() {
  return { cloud: env('CLOUDINARY_CLOUD_NAME'), key: env('CLOUDINARY_API_KEY'), secret: env('CLOUDINARY_API_SECRET') };
}

function cloudinarySignature(params, secret) {
  const input = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(`${input}${secret}`).digest('hex');
}

async function cloudinaryUpload(buffer, ownerEmail, id) {
  const config = cloudinaryConfig();
  if (!config.cloud || !config.key || !config.secret) throw Object.assign(new Error('CrewLock aguardando configuração do armazenamento.'), { status: 503 });
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `crewcheck/crewlock/${sha256(ownerEmail).slice(0, 18)}`;
  const params = { folder, public_id: id, timestamp };
  const form = new FormData();
  form.append('file', `data:application/octet-stream;base64,${buffer.toString('base64')}`);
  form.append('api_key', config.key);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('public_id', id);
  form.append('signature', cloudinarySignature(params, config.secret));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud)}/raw/upload`, { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.secure_url || !payload.public_id) throw Object.assign(new Error('O armazenamento não aceitou o documento agora.'), { status: 502 });
  return { publicId: String(payload.public_id), cipherUrl: String(payload.secure_url) };
}

async function cloudinaryDelete(publicId) {
  const config = cloudinaryConfig();
  if (!config.cloud || !config.key || !config.secret) return false;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  const form = new FormData();
  form.append('public_id', publicId);
  form.append('timestamp', String(timestamp));
  form.append('api_key', config.key);
  form.append('signature', cloudinarySignature(params, config.secret));
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloud)}/raw/destroy`, { method: 'POST', body: form });
    const payload = await response.json().catch(() => ({}));
    return response.ok && ['ok', 'not found'].includes(String(payload.result));
  } catch {
    return false;
  }
}

async function quota(context, incomingBytes) {
  if (context.admin && flag('CREWCHECK_CREWLOCK_ADMIN_BYPASS_QUOTA', true)) return;
  const plan = String(context.profile.plan || 'free');
  const maxFileMb = plan === 'free' ? Number(env('CREWCHECK_CREWLOCK_FREE_MAX_FILE_MB', '5')) : Number(env('CREWCHECK_CREWLOCK_PREMIUM_MAX_FILE_MB', '20'));
  const totalMb = plan === 'free' ? Number(env('CREWCHECK_CREWLOCK_FREE_TOTAL_MB', '25')) : Number(env('CREWCHECK_CREWLOCK_PREMIUM_TOTAL_MB', '500'));
  if (incomingBytes > maxFileMb * 1024 * 1024) throw Object.assign(new Error(`Arquivo acima de ${maxFileMb} MB.`), { status: 413 });
  const [rows] = await context.db.query("SELECT COALESCE(SUM(bytes),0) AS total FROM crewcheck_platform_documents WHERE owner_email=? AND status='active'", [context.email]);
  if (Number(rows[0]?.total || 0) + incomingBytes > totalMb * 1024 * 1024) throw Object.assign(new Error('Espaço do CrewLock atingido para este plano.'), { status: 413 });
}

function documentForClient(row) {
  return {
    id: row.id,
    category: row.category,
    encryptedName: row.encrypted_name,
    mimeType: row.mime_type,
    bytes: Number(row.bytes || 0),
    source: row.source,
    cipherAlgorithm: row.cipher_algorithm,
    cipherIv: row.cipher_iv,
    kdfSalt: row.cipher_tag,
    createdAt: row.created_at,
  };
}

async function listDocuments(context, res) {
  const [rows] = await context.db.query(
    "SELECT id,category,encrypted_name,mime_type,bytes,source,cipher_algorithm,cipher_iv,cipher_tag,created_at FROM crewcheck_platform_documents WHERE owner_email=? AND status='active' ORDER BY created_at DESC LIMIT 200",
    [context.email],
  );
  sendJson(res, 200, {
    ok: true,
    documents: rows.map(documentForClient),
    encryption: 'AES-256-GCM + PBKDF2-SHA-256 no dispositivo',
    serverCanDecrypt: false,
    message: 'CrewLock sincronizado.',
  });
}

async function uploadDocument(context, req, res) {
  const body = await readBody(req, 36_000_000);
  const mimeType = cleanText(body.mimeType, 160).toLowerCase();
  const category = cleanText(body.category || 'outro', 60);
  const encryptedName = String(body.encryptedName || '').trim();
  const cipherIv = String(body.cipherIv || '').trim();
  const kdfSalt = String(body.kdfSalt || '').trim();
  const cipherBase64 = String(body.cipherBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const cipher = Buffer.from(cipherBase64, 'base64');
  if (!ALLOWED_MIME.has(mimeType)) throw Object.assign(new Error('Use PDF, JPG, PNG, WEBP ou HEIC.'), { status: 400 });
  if (!cipher.length || encryptedName.length < 8 || cipherIv.length < 8 || kdfSalt.length < 8 || encryptedName.length > 4000 || cipherIv.length > 128 || kdfSalt.length > 128) {
    throw Object.assign(new Error('Pacote criptografado inválido.'), { status: 400 });
  }
  await quota(context, cipher.length);
  const id = crypto.randomUUID();
  const stored = await cloudinaryUpload(cipher, context.email, id);
  await context.db.query(
    `INSERT INTO crewcheck_platform_documents
     (id,owner_email,category,encrypted_name,mime_type,storage_provider,storage_public_id,storage_cipher_url,cipher_algorithm,cipher_iv,cipher_tag,plaintext_sha256,bytes,source,status)
     VALUES(?,?,?,?,?,'cloudinary',?,?,?,?,?,?,?,'app','active')`,
    [id, context.email, category, encryptedName, mimeType, stored.publicId, stored.cipherUrl, 'AES-256-GCM/PBKDF2-SHA-256/E2EE-v1', cipherIv, kdfSalt, sha256(cipher), cipher.length],
  );
  sendJson(res, 200, {
    ok: true,
    document: { id, category, encryptedName, mimeType, bytes: cipher.length, cipherAlgorithm: 'AES-256-GCM/PBKDF2-SHA-256/E2EE-v1', cipherIv, kdfSalt, createdAt: new Date().toISOString() },
    message: 'Documento cifrado no dispositivo e salvo no CrewLock.',
  });
}

async function downloadDocument(context, req, res, id) {
  const [rows] = await context.db.query("SELECT * FROM crewcheck_platform_documents WHERE id=? AND owner_email=? AND status='active' LIMIT 1", [id, context.email]);
  const document = rows[0];
  if (!document) return sendJson(res, 404, { ok: false, message: 'Documento não localizado.' });
  const response = await fetch(document.storage_cipher_url);
  if (!response.ok) return sendJson(res, 502, { ok: false, message: 'Documento temporariamente indisponível.' });
  const cipher = Buffer.from(await response.arrayBuffer());
  await context.db.query(
    'INSERT INTO crewcheck_platform_document_access (id,document_id,owner_email,action,device_hash) VALUES(?,?,?,?,?)',
    [crypto.randomUUID(), document.id, context.email, 'cipher-download', sha256(String(req.headers?.['user-agent'] || ''))],
  );
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': cipher.length,
    'content-disposition': `attachment; filename="crewlock-${document.id}.bin"`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-crewlock-encrypted-name': encodeURIComponent(document.encrypted_name),
    'x-crewlock-mime-type': document.mime_type,
    'x-crewlock-cipher-iv': document.cipher_iv,
    'x-crewlock-kdf-salt': document.cipher_tag,
    'x-crewlock-cipher-version': document.cipher_algorithm,
  });
  res.end(cipher);
}

async function deleteDocument(context, res, id) {
  const [rows] = await context.db.query("SELECT * FROM crewcheck_platform_documents WHERE id=? AND owner_email=? AND status='active' LIMIT 1", [id, context.email]);
  const document = rows[0];
  if (!document) return sendJson(res, 404, { ok: false, message: 'Documento não localizado.' });
  const providerDeleted = await cloudinaryDelete(document.storage_public_id);
  await context.db.query("UPDATE crewcheck_platform_documents SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3),storage_cipher_url='' WHERE id=? AND owner_email=?", [document.id, context.email]);
  if (!providerDeleted) {
    await context.db.query(
      'INSERT INTO crewcheck_platform_document_deletion_queue (id,document_id,owner_email,storage_public_id,last_error) VALUES(?,?,?,?,?)',
      [crypto.randomUUID(), document.id, context.email, document.storage_public_id, 'provider_pending'],
    );
  }
  sendJson(res, 200, { ok: true, deleted: true, providerDeleted, message: 'Documento removido do CrewLock.' });
}

export async function handleCrewLockRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/platform/crewlock/')) return false;
  if (!flag('CREWCHECK_CREWLOCK_ENABLED', true)) {
    sendJson(res, 404, { ok: false, message: 'CrewLock desativado.' });
    return true;
  }
  const context = await requireIdentity(req, res);
  if (!context) return true;
  if (url.pathname === '/api/platform/crewlock/documents') {
    if (req.method === 'POST') await uploadDocument(context, req, res);
    else if (req.method === 'GET') await listDocuments(context, res);
    else sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }
  const download = url.pathname.match(/^\/api\/platform\/crewlock\/documents\/([^/]+)\/download$/);
  if (download && req.method === 'GET') {
    await downloadDocument(context, req, res, download[1]);
    return true;
  }
  const item = url.pathname.match(/^\/api\/platform\/crewlock\/documents\/([^/]+)$/);
  if (item && req.method === 'DELETE') {
    await deleteDocument(context, res, item[1]);
    return true;
  }
  sendJson(res, 404, { ok: false, message: 'Recurso do CrewLock não localizado.' });
  return true;
}

export async function handleCrewLockTelegram(message = {}, sendTelegram) {
  const chatId = String(message?.chat?.id || '');
  if (!chatId || !message?.document) return false;
  const caption = String(message?.caption || '');
  if (!/^\/crewlock(?:@\S+)?\b/i.test(caption)) return false;
  await sendTelegram(chatId, [
    'CrewLock recebeu sua solicitação, mas não baixou o arquivo.',
    'Para manter a criptografia de ponta a ponta, abra o CrewLock no aplicativo, escolha a categoria e selecione o documento.',
    'O PIN do CrewLock nunca é enviado ao servidor ou ao Telegram.',
  ].join('\n'));
  return true;
}
