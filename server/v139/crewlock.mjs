import crypto from 'node:crypto';
import { cleanText, env, flag, readBody, requireIdentity, sendJson, sha256 } from './common.mjs';

const ALLOWED_MIME = new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
const MIME_BY_EXTENSION = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
};

function cloudinaryConfig() {
  const direct = {
    cloud: env('CLOUDINARY_CLOUD_NAME'),
    key: env('CLOUDINARY_API_KEY'),
    secret: env('CLOUDINARY_API_SECRET'),
  };
  const url = env('CLOUDINARY_URL');
  if (direct.cloud && direct.key && direct.secret) return { ...direct, source: 'split' };
  if (/^cloudinary:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return {
        cloud: parsed.hostname,
        key: decodeURIComponent(parsed.username),
        secret: decodeURIComponent(parsed.password),
        source: 'url',
      };
    } catch {}
  }
  return { ...direct, source: 'missing' };
}

function cloudinaryReady() {
  const config = cloudinaryConfig();
  return Boolean(config.cloud && config.key && config.secret);
}

function dbFallbackEnabled() {
  return flag('CREWCHECK_CREWLOCK_DB_FALLBACK', true);
}

function cloudinarySignature(params, secret) {
  const input = Object.keys(params).sort().map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHash('sha1').update(`${input}${secret}`).digest('hex');
}

async function cloudinaryUpload(buffer, ownerEmail, id) {
  const config = cloudinaryConfig();
  if (!config.cloud || !config.key || !config.secret) {
    throw Object.assign(new Error('Armazenamento externo do CrewLock ainda não está configurado.'), { status: 503, code: 'CREWLOCK_STORAGE_NOT_CONFIGURED' });
  }
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
  if (!response.ok || !payload.secure_url || !payload.public_id) {
    const providerMessage = cleanText(payload?.error?.message || payload?.message || '', 180);
    throw Object.assign(new Error(providerMessage ? `O armazenamento recusou o arquivo: ${providerMessage}` : 'O armazenamento não aceitou o documento agora.'), {
      status: 502,
      code: 'CREWLOCK_CLOUDINARY_REJECTED',
    });
  }
  return { provider: 'cloudinary', publicId: String(payload.public_id), cipherUrl: String(payload.secure_url) };
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

async function databaseUpload(context, buffer, id) {
  const maxMb = Math.max(1, Number(env('CREWCHECK_CREWLOCK_DB_FALLBACK_MAX_MB', '10')) || 10);
  if (buffer.length > maxMb * 1024 * 1024) {
    throw Object.assign(new Error(`O fallback seguro do banco aceita arquivos de até ${maxMb} MB.`), { status: 413, code: 'CREWLOCK_DB_FALLBACK_LIMIT' });
  }
  await context.db.query(
    'INSERT INTO crewcheck_platform_crewlock_blobs(document_id,owner_email,cipher,bytes) VALUES(?,?,?,?)',
    [id, context.email, buffer, buffer.length],
  );
  return { provider: 'aiven-mysql', publicId: id, cipherUrl: `db://${id}` };
}

async function persistCipher(context, buffer, id) {
  if (cloudinaryReady()) {
    try {
      return await cloudinaryUpload(buffer, context.email, id);
    } catch (error) {
      if (!dbFallbackEnabled()) throw error;
      console.warn('[crewcheck:crewlock:fallback]', String(error?.code || 'CLOUDINARY_FAILED'));
    }
  }
  if (dbFallbackEnabled()) return databaseUpload(context, buffer, id);
  throw Object.assign(new Error('Configure CLOUDINARY_URL ou habilite o fallback criptografado no Aiven.'), { status: 503, code: 'CREWLOCK_STORAGE_NOT_CONFIGURED' });
}

async function quota(context, incomingBytes) {
  if (context.admin && flag('CREWCHECK_CREWLOCK_ADMIN_BYPASS_QUOTA', true)) return;
  const plan = String(context.profile.plan || 'free');
  const maxFileMb = plan === 'free' ? Number(env('CREWCHECK_CREWLOCK_FREE_MAX_FILE_MB', '5')) : Number(env('CREWCHECK_CREWLOCK_PREMIUM_MAX_FILE_MB', '20'));
  const totalMb = plan === 'free' ? Number(env('CREWCHECK_CREWLOCK_FREE_TOTAL_MB', '25')) : Number(env('CREWCHECK_CREWLOCK_PREMIUM_TOTAL_MB', '500'));
  if (incomingBytes > maxFileMb * 1024 * 1024) throw Object.assign(new Error(`Arquivo acima de ${maxFileMb} MB.`), { status: 413, code: 'CREWLOCK_FILE_LIMIT' });
  const [rows] = await context.db.query("SELECT COALESCE(SUM(bytes),0) AS total FROM crewcheck_platform_documents WHERE owner_email=? AND status='active'", [context.email]);
  if (Number(rows[0]?.total || 0) + incomingBytes > totalMb * 1024 * 1024) throw Object.assign(new Error('Espaço do CrewLock atingido para este plano.'), { status: 413, code: 'CREWLOCK_TOTAL_LIMIT' });
}

function documentForClient(row) {
  return {
    id: row.id,
    category: row.category,
    encryptedName: row.encrypted_name,
    mimeType: row.mime_type,
    bytes: Number(row.bytes || 0),
    source: row.source,
    storageProvider: row.storage_provider,
    cipherAlgorithm: row.cipher_algorithm,
    cipherIv: row.cipher_iv,
    kdfSalt: row.cipher_tag,
    createdAt: row.created_at,
  };
}

function resolveMimeType(body) {
  const supplied = cleanText(body.mimeType, 160).toLowerCase();
  if (ALLOWED_MIME.has(supplied)) return supplied;
  const extension = cleanText(body.fileExtension || body.fileName || '', 40).toLowerCase().replace(/^.*\./, '');
  return MIME_BY_EXTENSION[extension] || supplied;
}

async function health(context, res) {
  let tableReady = false;
  try {
    await context.db.query('SELECT document_id FROM crewcheck_platform_crewlock_blobs LIMIT 1');
    tableReady = true;
  } catch {}
  const config = cloudinaryConfig();
  sendJson(res, 200, {
    ok: cloudinaryReady() || (dbFallbackEnabled() && tableReady),
    enabled: flag('CREWCHECK_CREWLOCK_ENABLED', true),
    encryption: 'AES-256-GCM/PBKDF2-SHA-256/E2EE-v1',
    cloudinary: cloudinaryReady(),
    cloudinarySource: cloudinaryReady() ? config.source : 'missing',
    databaseFallback: dbFallbackEnabled(),
    databaseFallbackReady: tableReady,
    maxDatabaseFallbackMb: Number(env('CREWCHECK_CREWLOCK_DB_FALLBACK_MAX_MB', '10')) || 10,
    message: cloudinaryReady()
      ? 'CrewLock pronto com armazenamento externo cifrado.'
      : tableReady && dbFallbackEnabled()
        ? 'CrewLock pronto com fallback cifrado no Aiven.'
        : 'CrewLock precisa de CLOUDINARY_URL ou da migration v13.9.1 para o fallback no Aiven.',
  });
}

async function listDocuments(context, res) {
  const [rows] = await context.db.query(
    "SELECT id,category,encrypted_name,mime_type,bytes,source,storage_provider,cipher_algorithm,cipher_iv,cipher_tag,created_at FROM crewcheck_platform_documents WHERE owner_email=? AND status='active' ORDER BY created_at DESC LIMIT 200",
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
  const body = await readBody(req, 38_000_000);
  const mimeType = resolveMimeType(body);
  const category = cleanText(body.category || 'outro', 60);
  const encryptedName = String(body.encryptedName || '').trim();
  const cipherIv = String(body.cipherIv || '').trim();
  const kdfSalt = String(body.kdfSalt || '').trim();
  const cipherBase64 = String(body.cipherBase64 || '').replace(/^data:[^;]+;base64,/, '');
  const cipher = Buffer.from(cipherBase64, 'base64');
  if (!ALLOWED_MIME.has(mimeType)) throw Object.assign(new Error('Use PDF, JPG, PNG, WEBP ou HEIC.'), { status: 400, code: 'CREWLOCK_FILE_TYPE' });
  if (!cipher.length || encryptedName.length < 8 || cipherIv.length < 8 || kdfSalt.length < 8 || encryptedName.length > 4000 || cipherIv.length > 128 || kdfSalt.length > 128) {
    throw Object.assign(new Error('Pacote criptografado inválido. Atualize a página e tente novamente.'), { status: 400, code: 'CREWLOCK_INVALID_PACKAGE' });
  }
  await quota(context, cipher.length);
  const id = crypto.randomUUID();
  const stored = await persistCipher(context, cipher, id);
  try {
    await context.db.query(
      `INSERT INTO crewcheck_platform_documents
       (id,owner_email,category,encrypted_name,mime_type,storage_provider,storage_public_id,storage_cipher_url,cipher_algorithm,cipher_iv,cipher_tag,plaintext_sha256,bytes,source,status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'app','active')`,
      [id, context.email, category, encryptedName, mimeType, stored.provider, stored.publicId, stored.cipherUrl, 'AES-256-GCM/PBKDF2-SHA-256/E2EE-v1', cipherIv, kdfSalt, sha256(cipher), cipher.length],
    );
  } catch (error) {
    if (stored.provider === 'aiven-mysql') await context.db.query('DELETE FROM crewcheck_platform_crewlock_blobs WHERE document_id=? AND owner_email=?', [id, context.email]).catch(() => undefined);
    else await cloudinaryDelete(stored.publicId);
    throw error;
  }
  sendJson(res, 200, {
    ok: true,
    document: { id, category, encryptedName, mimeType, bytes: cipher.length, storageProvider: stored.provider, cipherAlgorithm: 'AES-256-GCM/PBKDF2-SHA-256/E2EE-v1', cipherIv, kdfSalt, createdAt: new Date().toISOString() },
    message: stored.provider === 'cloudinary' ? 'Documento cifrado e salvo no CrewLock.' : 'Documento cifrado e salvo no fallback seguro do Aiven.',
  });
}

async function cipherForDocument(context, document) {
  if (document.storage_provider === 'aiven-mysql' || String(document.storage_cipher_url || '').startsWith('db://')) {
    const [rows] = await context.db.query('SELECT cipher FROM crewcheck_platform_crewlock_blobs WHERE document_id=? AND owner_email=? LIMIT 1', [document.id, context.email]);
    if (!rows[0]?.cipher) throw Object.assign(new Error('Conteúdo cifrado não localizado no Aiven.'), { status: 404, code: 'CREWLOCK_BLOB_NOT_FOUND' });
    return Buffer.from(rows[0].cipher);
  }
  const response = await fetch(document.storage_cipher_url);
  if (!response.ok) throw Object.assign(new Error('Documento temporariamente indisponível no armazenamento.'), { status: 502, code: 'CREWLOCK_DOWNLOAD_FAILED' });
  return Buffer.from(await response.arrayBuffer());
}

async function downloadDocument(context, req, res, id) {
  const [rows] = await context.db.query("SELECT * FROM crewcheck_platform_documents WHERE id=? AND owner_email=? AND status='active' LIMIT 1", [id, context.email]);
  const document = rows[0];
  if (!document) return sendJson(res, 404, { ok: false, message: 'Documento não localizado.' });
  const cipher = await cipherForDocument(context, document);
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
  let providerDeleted = false;
  if (document.storage_provider === 'aiven-mysql' || String(document.storage_cipher_url || '').startsWith('db://')) {
    await context.db.query('DELETE FROM crewcheck_platform_crewlock_blobs WHERE document_id=? AND owner_email=?', [document.id, context.email]);
    providerDeleted = true;
  } else {
    providerDeleted = await cloudinaryDelete(document.storage_public_id);
  }
  await context.db.query("UPDATE crewcheck_platform_documents SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3),storage_cipher_url='' WHERE id=? AND owner_email=?", [document.id, context.email]);
  if (!providerDeleted && document.storage_provider === 'cloudinary') {
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
  if (url.pathname === '/api/platform/crewlock/health') {
    await health(context, res);
    return true;
  }
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
    'Para preservar a criptografia de ponta a ponta, abra o CrewLock no aplicativo, escolha a categoria e selecione o documento.',
    'O PIN nunca é enviado ao servidor ou ao Telegram.',
  ].join('\n'));
  return true;
}
