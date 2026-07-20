import crypto from 'node:crypto';
import {
  cleanText,
  dbPool,
  ensureProfile,
  isAdminEmail,
  readBody,
  requestToken,
  safeEmail,
  sendJson,
  verifyJwt,
} from '../v139/common.mjs';

function passwordDigest(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function generateTemporaryPassword() {
  const token = crypto.randomBytes(9).toString('base64url');
  return `Crew#${token}9!`;
}

async function ensurePartnerTable(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS crewcheck_partner_accounts (
    email VARCHAR(190) PRIMARY KEY,
    partner_name VARCHAR(120) NOT NULL,
    contact_name VARCHAR(120) NOT NULL,
    notes VARCHAR(500) NULL,
    created_by VARCHAR(190) NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

function requireAdmin(req) {
  const payload = verifyJwt(requestToken(req));
  const email = safeEmail(payload?.email);
  if (!payload || !email || !isAdminEmail(email) || !payload.admin) {
    throw Object.assign(new Error('Acesso restrito ao administrador.'), { status: 403 });
  }
  return email;
}

async function listPartners(res, db) {
  await ensurePartnerTable(db);
  const [rows] = await db.query(`
    SELECT p.email, p.partner_name AS partnerName, p.contact_name AS contactName,
           p.notes, p.created_by AS createdBy, p.created_at AS createdAt,
           a.must_change_password AS mustChangePassword,
           pr.plan, pr.display_name AS displayName
      FROM crewcheck_partner_accounts p
      LEFT JOIN crewcheck_platform_accounts a ON a.email=p.email
      LEFT JOIN crewcheck_platform_profiles pr ON pr.email=p.email
     ORDER BY p.created_at DESC
     LIMIT 200`);
  return sendJson(res, 200, { ok: true, partners: rows });
}

async function createPartner(req, res, db, adminEmail) {
  const body = await readBody(req, 100_000);
  const email = safeEmail(body.email);
  const contactName = cleanText(body.contactName || body.name, 120);
  const partnerName = cleanText(body.partnerName || body.company, 120);
  const notes = cleanText(body.notes, 500);
  const suppliedPassword = String(body.temporaryPassword || '');
  const temporaryPassword = suppliedPassword || generateTemporaryPassword();

  if (!email || !contactName || !partnerName) {
    return sendJson(res, 400, { ok: false, message: 'Informe nome, organização e e-mail válidos.' });
  }
  if (temporaryPassword.length < 10 || !/[A-Z]/.test(temporaryPassword) || !/[a-z]/.test(temporaryPassword) || !/\d/.test(temporaryPassword) || !/[^A-Za-z0-9]/.test(temporaryPassword)) {
    return sendJson(res, 400, { ok: false, message: 'A senha temporária deve ter pelo menos 10 caracteres, maiúscula, minúscula, número e símbolo.' });
  }

  await ensurePartnerTable(db);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
    if (existing[0] && !body.replaceExisting) {
      await connection.rollback();
      return sendJson(res, 409, { ok: false, message: 'Este e-mail já possui uma conta. Ative “substituir acesso existente” para redefinir o acesso.' });
    }

    await ensureProfile(connection, email, contactName);
    await connection.query(
      `UPDATE crewcheck_platform_profiles
          SET display_name=?, locale='pt-BR', timezone='America/Sao_Paulo', plan='premium_unlimited'
        WHERE email=?`,
      [contactName, email],
    );

    const digest = passwordDigest(temporaryPassword);
    await connection.query(
      `INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password)
       VALUES(?,?,?,1)
       ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), password_salt=VALUES(password_salt), must_change_password=1`,
      [email, digest.hash, digest.salt],
    );
    await connection.query(
      `INSERT INTO crewcheck_partner_accounts (email,partner_name,contact_name,notes,created_by)
       VALUES(?,?,?,?,?)
       ON DUPLICATE KEY UPDATE partner_name=VALUES(partner_name), contact_name=VALUES(contact_name), notes=VALUES(notes), created_by=VALUES(created_by)`,
      [email, partnerName, contactName, notes || null, adminEmail],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return sendJson(res, 201, {
    ok: true,
    message: 'Conta de parceiro criada com Premium e troca obrigatória de senha.',
    account: { email, contactName, partnerName, plan: 'premium_unlimited', mustChangePassword: true },
    temporaryPassword,
  });
}

export async function handlePartnerAccountsRoute(req, res, url) {
  if (url.pathname !== '/api/admin/partner-accounts') return false;
  try {
    const adminEmail = requireAdmin(req);
    const db = await dbPool();
    if (!db) return sendJson(res, 503, { ok: false, message: 'Banco de dados indisponível.' }), true;
    if (req.method === 'GET') await listPartners(res, db);
    else if (req.method === 'POST') await createPartner(req, res, db, adminEmail);
    else sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  } catch (error) {
    sendJson(res, Number(error?.status || 500), {
      ok: false,
      message: Number(error?.status || 500) >= 500 ? 'Não foi possível concluir a criação da conta agora.' : error.message,
    });
  }
  return true;
}
