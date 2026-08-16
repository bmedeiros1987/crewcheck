import crypto from 'node:crypto';
import {
  authSecret,
  cleanText,
  clearAuthCookie,
  dbPool,
  ensureProfile,
  env,
  flag,
  isAdminEmail,
  issueJwt,
  readBody,
  requestToken,
  safeEmail,
  secureCompare,
  sendJson,
  setAuthCookie,
  userFromAccount,
  verifyJwt,
} from './common.mjs';
import {
  callTelegram,
  callUsageAllowed,
  consumeCallUsage,
  sendSystemEmail,
  sendTelegram,
  telegramLink,
  telegramToken,
} from './delivery.mjs';

const CREW_FUNCTIONS = new Set([
  'Comissário(a) de voo',
  'Chefe de cabine',
  'Copiloto',
  'Comandante',
  'Copiloto Embraer',
  'Comandante Embraer',
]);

function passwordDigest(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function passwordMatches(password, salt, expected) {
  try {
    return secureCompare(passwordDigest(password, salt).hash, expected);
  } catch {
    return false;
  }
}

// Structural check only - never used to infer WHICH algorithm produced a
// non-conforming hash, only whether this row's shape matches what the current
// passwordDigest() always produces (32 hex chars from crypto.randomBytes(16),
// 128 hex chars from scryptSync(...,64)). A row that doesn't conform can only have
// been written outside this code path (direct SQL, an external migration, a prior
// scheme) - passwordMatches() would never succeed against it no matter what the
// user types, so failing it should not be reported as "wrong password".
function isCurrentScryptFormat(salt, hash) {
  return /^[0-9a-f]{32}$/i.test(String(salt || '')) && /^[0-9a-f]{128}$/i.test(String(hash || ''));
}

function resetHash(email, code) {
  return crypto.createHmac('sha256', authSecret()).update(`password-reset|${safeEmail(email)}|${String(code)}`).digest('hex');
}

function blockedDomains() {
  return env('CREWCHECK_BLOCKED_EMAIL_DOMAINS', 'latam.com,latamairlines.com,lan.com,tam.com.br')
    .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function loginResponse(res, user, message) {
  const token = issueJwt(user);
  setAuthCookie(res, token);
  return sendJson(res, 200, { ok: true, token, user, message });
}

function resetMessage(code, minutes) {
  return [
    'Código temporário CrewCheck', '', `Código: ${code}`, `Validade: ${minutes} minutos}`, '',
    'Use o código somente na tela oficial do CrewCheck.',
    'O suporte nunca solicitará sua senha definitiva.',
  ].join('\n');
}

function normalizeCrewFunction(value) {
  const cleaned = cleanText(value || '', 64);
  return CREW_FUNCTIONS.has(cleaned) ? cleaned : '';
}

async function ensureCrewFunctionTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS crewcheck_platform_profile_functions (
      email VARCHAR(254) NOT NULL,
      crew_function VARCHAR(64) NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function saveCrewFunction(db, email, crewFunction) {
  await ensureCrewFunctionTable(db);
  await db.query(
    `INSERT INTO crewcheck_platform_profile_functions (email, crew_function)
     VALUES(?,?)
     ON DUPLICATE KEY UPDATE crew_function=VALUES(crew_function), updated_at=CURRENT_TIMESTAMP(3)`,
    [email, crewFunction],
  );
}

async function enrichCrewFunction(db, email, user) {
  try {
    await ensureCrewFunctionTable(db);
    const [rows] = await db.query(
      'SELECT crew_function FROM crewcheck_platform_profile_functions WHERE email=? LIMIT 1',
      [email],
    );
    return { ...user, rank: normalizeCrewFunction(rows[0]?.crew_function) || null };
  } catch (error) {
    console.warn('[crewcheck:auth:crew-function]', String(error?.code || 'PROFILE_FUNCTION_UNAVAILABLE'));
    return { ...user, rank: null };
  }
}

async function config(res) {
  return sendJson(res, 200, {
    ok: true,
    configured: true,
    authRequired: true,
    registrationEnabled: true,
    passwordResetEnabled: flag('CREWCHECK_PASSWORD_RESET_ENABLED', true),
    resetChannels: {
      email: true,
      telegram: Boolean(telegramToken()),
      telegramCall: flag('CALLMEBOT_TELEGRAM_CALL_ENABLED', true),
    },
    emailVerificationRequired: false,
    blockedDomains: blockedDomains(),
    message: 'Autenticação e recuperação disponíveis.',
  });
}

async function register(req, res, db) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const body = await readBody(req, 300_000);
  const email = safeEmail(body.email);
  const password = String(body.password || '');
  const name = cleanText(body.name || '', 120);
  const crewFunction = normalizeCrewFunction(body.rank || body.crewFunction || body.function);
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail pessoal válido.' });
  if (blockedDomains().includes(email.split('@')[1])) {
    return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });
  }
  if (password.length < 8) return sendJson(res, 400, { ok: false, message: 'Use pelo menos 8 caracteres.' });
  if (!crewFunction) return sendJson(res, 400, { ok: false, message: 'Informe sua função para aplicar corretamente as regras e valores do seu perfil.' });
  const [existing] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
  if (existing[0]) return sendJson(res, 409, { ok: false, message: 'Este e-mail já possui cadastro. Use Recuperar senha.' });
  const digest = passwordDigest(password);
  await ensureProfile(db, email, name);
  await db.query(
    'INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password) VALUES(?,?,?,0)',
    [email, digest.hash, digest.salt],
  );
  await saveCrewFunction(db, email, crewFunction);
  const user = await enrichCrewFunction(db, email, await userFromAccount(db, email));
  return loginResponse(res, user, 'Cadastro concluído.');
}

async function login(req, res, db) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const body = await readBody(req, 200_000);
  const email = safeEmail(body.email || body.username || body.login);
  const password = String(body.password || '');
  if (!email || !password) return sendJson(res, 400, { ok: false, message: 'Informe e-mail e senha.' });
  const [accounts] = await db.query('SELECT * FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
  const account = accounts[0];
  const emergencyPassword = env('CREWCHECK_TEST_ACCOUNT_PASSWORD');
  if (!account && isAdminEmail(email) && emergencyPassword && secureCompare(password, emergencyPassword)) {
    return loginResponse(res, await enrichCrewFunction(db, email, await userFromAccount(db, email)), 'Administrador conectado.');
  }
  if (!account) {
    // Uma conta antiga (identidade com perfil, mas sem hash de senha no padrão
    // atual) não tem nenhuma senha conhecida para validar. Aceitar qualquer valor
    // enfraqueceria a autenticação; negar com a mesma mensagem genérica de senha
    // incorreta engana quem acredita ter digitado a senha certa. A identidade é
    // preservada (nada é criado/alterado aqui) e o usuário é direcionado à
    // recuperação verificada, que já cria a credencial no padrão atual somente
    // após confirmação (ver requestReset/resetPassword).
    const [profiles] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);
    if (profiles[0]) {
      return sendJson(res, 401, {
        ok: false,
        code: 'legacy_credential',
        message: 'Esta conta existe, mas ainda não tem uma senha definida no padrão atual. Toque em "Esqueci minha senha" para criar uma nova senha e continuar.',
      });
    }
    return sendJson(res, 401, { ok: false, code: 'account_not_found', message: 'E-mail ou senha inválidos.' });
  }
  if (!passwordMatches(password, account.password_salt, account.password_hash)) {
    // An account row existing is not enough to prove a "wrong password" - two other
    // structural states collapse into the same passwordMatches() failure and deserve
    // their own classification, never a fallback accept:
    //  - must_change_password=1: the stored hash is a KNOWN placeholder (requestReset's
    //    account-creation-on-request path) or a system-generated temp password
    //    (partner invite) that the user could never legitimately type. Whatever they
    //    enter will correctly fail forever until they complete recovery.
    //  - a hash/salt that doesn't match the current scheme's own shape can only have
    //    been written outside this code path; passwordMatches() can never succeed
    //    against it regardless of what password is correct.
    if (account.must_change_password) {
      return sendJson(res, 401, {
        ok: false,
        code: 'account_state',
        message: 'Esta conta precisa concluir a definição de senha. Toque em "Esqueci minha senha" para criar uma nova senha e continuar.',
      });
    }
    if (!isCurrentScryptFormat(account.password_salt, account.password_hash)) {
      return sendJson(res, 401, {
        ok: false,
        code: 'unknown_hash_state',
        message: 'Não foi possível validar esta senha no padrão atual. Toque em "Esqueci minha senha" para criar uma nova senha e continuar.',
      });
    }
    return sendJson(res, 401, { ok: false, code: 'password_mismatch', message: 'E-mail ou senha inválidos.' });
  }
  await db.query('UPDATE crewcheck_platform_accounts SET last_login_at=CURRENT_TIMESTAMP(3) WHERE email=?', [email]);
  const user = await enrichCrewFunction(db, email, await userFromAccount(db, email, Boolean(account.must_change_password)));
  return loginResponse(res, user, account.must_change_password ? 'Entre e defina uma nova senha.' : 'Login realizado.');
}

async function requestReset(req, res, db) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const body = await readBody(req, 200_000);
  const email = safeEmail(body.email);
  const delivery = ['email', 'telegram', 'both', 'telegram-call'].includes(String(body.delivery)) ? String(body.delivery) : 'both';
  const generic = { ok: true, delivery, message: 'Se a conta estiver cadastrada, o código temporário será enviado pelos canais disponíveis.' };
  if (!email || !flag('CREWCHECK_PASSWORD_RESET_ENABLED', true)) return sendJson(res, 200, generic);

  const [profiles] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);
  const [accounts] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
  if (!profiles[0] && !accounts[0] && !isAdminEmail(email)) return sendJson(res, 200, generic);
  if (!accounts[0]) {
    const placeholder = passwordDigest(crypto.randomBytes(32).toString('base64url'));
    await ensureProfile(db, email);
    await db.query(
      'INSERT IGNORE INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password) VALUES(?,?,?,1)',
      [email, placeholder.hash, placeholder.salt],
    );
  }

  const minutes = Math.max(5, Math.min(30, Number(env('CREWCHECK_PASSWORD_RESET_CODE_MINUTES', '10'))));
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const resetId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const connection = await db.getConnection();
  let issued = false;
  try {
    await connection.beginTransaction();
    await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);
    const [recent] = await connection.query(
      'SELECT created_at FROM crewcheck_platform_password_resets WHERE email=? ORDER BY created_at DESC LIMIT 1',
      [email],
    );
    if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
      await connection.rollback();
      return sendJson(res, 200, generic);
    }
    await connection.query(
      'UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL',
      [email],
    );
    await connection.query(
      'INSERT INTO crewcheck_platform_password_resets (id,email,code_hash,expires_at,channels) VALUES(?,?,?,?,?)',
      [resetId, email, resetHash(email, code), expiresAt, JSON.stringify({ requested: delivery })],
    );
    await connection.commit();
    issued = true;
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
  if (!issued) return sendJson(res, 200, generic);

  const link = await telegramLink(db, email);
  const channels = { email: false, telegram: false, telegramCall: false };
  const message = resetMessage(code, minutes);
  if (delivery === 'email' || delivery === 'both') {
    const mail = await sendSystemEmail({
      to: email,
      subject: 'Código temporário de acesso CrewCheck',
      text: message,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px"><h1>Código temporário CrewCheck</h1><p>Use o código abaixo para criar uma nova senha:</p><div style="font-size:34px;font-weight:900;letter-spacing:8px;padding:20px;background:#eef8ff;border-radius:16px;text-align:center">${code}</div><p>Validade: ${minutes} minutos.</p><p>O suporte nunca solicitará sua senha definitiva.</p></div>`,
    });
    channels.email = mail.ok;
  }
  if (delivery === 'telegram' || delivery === 'both' || delivery === 'telegram-call') {
    channels.telegram = (await sendTelegram(link?.chatId, message)).ok;
  }
  if (delivery === 'telegram-call') {
    const usage = await callUsageAllowed(db, email);
    if (usage.allowed) {
      const spoken = `Seu código temporário CrewCheck é ${code.split('').join(', ')}. Repetindo: ${code.split('').join(', ')}.`;
      const called = await callTelegram(link?.username, spoken);
      channels.telegramCall = called.ok;
      if (called.ok) await consumeCallUsage(db, email, usage);
    }
  }
  await db.query('UPDATE crewcheck_platform_password_resets SET channels=? WHERE id=?', [JSON.stringify(channels), resetId]);
  return sendJson(res, 200, generic);
}

async function resetPassword(req, res, db) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  const body = await readBody(req, 200_000);
  const email = safeEmail(body.email);
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 6);
  const password = String(body.password || '');
  const confirmation = String(body.confirmPassword || password);
  if (!email || code.length !== 6 || password.length < 8 || password !== confirmation) {
    return sendJson(res, 400, { ok: false, message: 'Confira e-mail, código e a nova senha de pelo menos 8 caracteres.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1 FOR UPDATE', [email]);
    const [rows] = await connection.query(
      'SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [email],
    );
    const reset = rows[0];
    if (!reset || new Date(reset.expires_at).getTime() < Date.now() || Number(reset.attempts || 0) >= 5) {
      await connection.rollback();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }
    if (!secureCompare(reset.code_hash, resetHash(email, code))) {
      await connection.query('UPDATE crewcheck_platform_password_resets SET attempts=attempts+1 WHERE id=?', [reset.id]);
      await connection.commit();
      return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
    }
    const digest = passwordDigest(password);
    await connection.query(
      'UPDATE crewcheck_platform_accounts SET password_hash=?,password_salt=?,must_change_password=0 WHERE email=?',
      [digest.hash, digest.salt, email],
    );
    await connection.query(
      'UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE email=? AND used_at IS NULL',
      [email],
    );
    await connection.commit();
    return sendJson(res, 200, { ok: true, message: 'Senha atualizada. Entre novamente.' });
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    connection.release();
  }
}

async function me(req, res, db) {
  let payload = null;
  try {
    payload = verifyJwt(requestToken(req));
  } catch (error) {
    return sendJson(res, Number(error?.status || 503), { ok: false, authenticated: false, message: error?.message });
  }
  const email = safeEmail(payload?.email);
  if (!email) return sendJson(res, 401, { ok: false, authenticated: false, message: 'Sessão expirada.' });
  // A valid token means the session itself is fine - a query failure here is a transient
  // backend problem (connection drop, deadlock, restart mid-request), not proof the
  // session is invalid. Without this, an unhandled rejection here reaches only the
  // process-level uncaughtException logger (no HTTP response ever gets sent), so the
  // client's request hangs indefinitely instead of failing fast with a status the client
  // can classify as "backend unavailable" rather than "log out".
  try {
    const [accounts] = await db.query('SELECT must_change_password FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
    return sendJson(res, 200, {
      ok: true,
      authenticated: true,
      user: await enrichCrewFunction(db, email, await userFromAccount(db, email, Boolean(accounts[0]?.must_change_password))),
    });
  } catch (error) {
    console.error('[crewcheck:auth:me]', String(error?.code || error?.message || 'ME_QUERY_FAILED'));
    return sendJson(res, 503, { ok: false, authenticated: false, code: 'BACKEND_UNAVAILABLE', message: 'Não foi possível confirmar sua sessão agora. Tente novamente.' });
  }
}

// Structural classification only - no password, full hash, full salt, or token is
// ever included in the response. `recognized_legacy` is intentionally not a possible
// return value: no legacy password scheme is referenced anywhere in this repository's
// history, so implementing a verifier for one would be guessing, and #399's own rule
// is that an unidentified scheme must classify as unknown_hash_state/legacy_credential
// instead of ever being treated as a match.
function classifyCredentialState(profile, account) {
  if (!profile && !account) return 'no_identity';
  if (!account) return 'profile_only_legacy';
  if (account.must_change_password) return 'account_state';
  if (!isCurrentScryptFormat(account.password_salt, account.password_hash)) return 'unknown_hash_state';
  return 'current_scrypt';
}

async function diagnoseCredentialState(req, res, db) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
  let payload = null;
  try {
    payload = verifyJwt(requestToken(req));
  } catch (error) {
    return sendJson(res, Number(error?.status || 503), { ok: false, message: error?.message || 'Autenticação indisponível.' });
  }
  const adminEmail = safeEmail(payload?.email);
  if (!adminEmail || !(payload?.admin || isAdminEmail(adminEmail))) {
    return sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
  }
  const body = await readBody(req, 2_000);
  const target = safeEmail(body.email);
  if (!target) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });

  const [profiles] = await db.query('SELECT email, public_id, created_at FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [target]);
  const [accounts] = await db.query(
    'SELECT email, password_hash, password_salt, must_change_password, created_at, updated_at, last_login_at FROM crewcheck_platform_accounts WHERE email=? LIMIT 1',
    [target],
  );
  const profile = profiles[0] || null;
  const account = accounts[0] || null;

  // Duplicate-identity signal: rows a case/whitespace-insensitive comparison would
  // treat as "the same" but whose stored value differs byte-for-byte from the app's
  // own canonical safeEmail() output (login()/register() always query by the exact
  // normalized value, so this can only happen via a write path outside this module).
  const [profileVariants] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE LOWER(TRIM(email))=LOWER(TRIM(?))', [target]);
  const [accountVariants] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE LOWER(TRIM(email))=LOWER(TRIM(?))', [target]);
  const duplicateIdentity = profileVariants.some((row) => row.email !== target) || accountVariants.some((row) => row.email !== target);

  return sendJson(res, 200, {
    ok: true,
    normalizedEmail: target,
    state: duplicateIdentity ? 'duplicate_identity' : classifyCredentialState(profile, account),
    profileExists: Boolean(profile),
    accountExists: Boolean(account),
    profileCreatedAt: profile?.created_at || null,
    accountCreatedAt: account?.created_at || null,
    accountUpdatedAt: account?.updated_at || null,
    lastLoginAt: account?.last_login_at || null,
    mustChangePassword: Boolean(account?.must_change_password),
    credentialFormat: account ? {
      hashLength: String(account.password_hash || '').length,
      saltLength: String(account.password_salt || '').length,
      recognizedCurrentScheme: isCurrentScryptFormat(account.password_salt, account.password_hash),
    } : null,
    duplicateIdentity,
    message: 'Diagnóstico sanitizado - nenhuma senha, hash completo, salt completo ou token é retornado.',
  });
}

export async function handleAuthRoute(req, res, url) {
  if (!url.pathname.startsWith('/api/auth/')) return false;
  if (url.pathname === '/api/auth/config') {
    await config(res);
    return true;
  }
  const db = await dbPool();
  if (!db) {
    sendJson(res, 503, { ok: false, message: 'Banco Aiven indisponível.' });
    return true;
  }
  if (url.pathname === '/api/auth/register') await register(req, res, db);
  else if (url.pathname === '/api/auth/login') await login(req, res, db);
  else if (url.pathname === '/api/auth/request-reset') await requestReset(req, res, db);
  else if (url.pathname === '/api/auth/reset-password') await resetPassword(req, res, db);
  else if (url.pathname === '/api/auth/me') await me(req, res, db);
  else if (url.pathname === '/api/auth/admin/diagnose-credential') await diagnoseCredentialState(req, res, db);
  else if (url.pathname === '/api/auth/logout') {
    clearAuthCookie(res);
    sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
  } else sendJson(res, 404, { ok: false, message: 'Recurso de autenticação não localizado.' });
  return true;
}