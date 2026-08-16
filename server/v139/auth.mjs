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

// #399 identity-loss audit: curated list of owner_email/email-scoped tables most
// relevant to roster/importações, assinatura, preferências and ownership. Read-only -
// nothing here ever writes, drops, truncates, or repairs anything. It only reports
// aggregate, sanitized counts so a human can decide the recovery strategy.
const IDENTITY_AUDIT_TABLES = [
  { table: 'crewcheck_platform_rosters', ownerColumn: 'owner_email', label: 'roster/importações' },
  { table: 'crewcheck_platform_subscriptions', ownerColumn: 'email', label: 'assinatura' },
  { table: 'crewcheck_platform_usage', ownerColumn: 'email', label: 'uso mensal' },
  { table: 'crewcheck_platform_stays', ownerColumn: 'owner_email', label: 'pernoite' },
  { table: 'crewcheck_platform_routine_preferences', ownerColumn: 'owner_email', label: 'preferências de rotina' },
  { table: 'crewcheck_platform_addresses', ownerColumn: 'owner_email', label: 'endereços/ownership' },
];

// Every table this codebase's migrations are known to create (accounts/profiles plus
// the full platform + v139/v1391/v1395/v14316/p1-auth families). Anything present in
// the live schema but absent here is worth a human look - it could be a stray table
// from an incomplete migration, not necessarily anything wrong.
const IDENTITY_AUDIT_KNOWN_TABLES = new Set([
  'crewcheck_schema_migrations', 'crewcheck_platform_profiles', 'crewcheck_platform_accounts',
  'crewcheck_platform_subscriptions', 'crewcheck_platform_usage', 'crewcheck_platform_rosters',
  'crewcheck_platform_hotel_rules', 'crewcheck_platform_stays', 'crewcheck_platform_shares',
  'crewcheck_platform_visitors', 'crewcheck_platform_connections', 'crewcheck_platform_chat_threads',
  'crewcheck_platform_chat_messages', 'crewcheck_platform_gym_checkins', 'crewcheck_platform_webhook_events',
  'crewcheck_platform_emergencies', 'crewcheck_telegram_state', 'crewcheck_platform_auth_attempts',
  'crewcheck_platform_addresses', 'crewcheck_platform_user_hotels', 'crewcheck_platform_gym_preferences',
  'crewcheck_platform_routine_preferences', 'crewcheck_platform_parking_positions', 'crewcheck_platform_finance_configs',
  'crewcheck_platform_flight_follows', 'crewcheck_platform_swap_analyses', 'crewcheck_platform_schedule_comparisons',
  'crewcheck_platform_terms', 'crewcheck_platform_terms_acceptances', 'crewcheck_platform_password_resets',
  'crewcheck_platform_profile_functions', 'crewcheck_platform_crewlock_blobs', 'crewcheck_platform_emergency_profiles',
  'crewcheck_platform_emergency_preferences', 'crewcheck_platform_emergency_alerts', 'crewcheck_platform_emergency_sessions',
  'crewcheck_platform_emergency_responses', 'crewcheck_guardian_cards', 'crewcheck_support_tickets',
  'crewcheck_aggregate_metrics', 'crewcheck_telegram_locations', 'crewcheck_platform_auth_artifacts',
  'crewcheck_platform_email_identity_state', 'crewcheck_scheduler_heartbeat',
]);

async function dateRangeAndMonthlyDistribution(db, table) {
  const [rangeRows] = await db.query(`SELECT MIN(created_at) AS minCreatedAt, MAX(created_at) AS maxCreatedAt, COUNT(*) AS total FROM ${table}`);
  const range = rangeRows[0] || {};
  const [byMonth] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS monthKey, COUNT(*) AS count FROM ${table} GROUP BY monthKey ORDER BY monthKey`,
  );
  return { total: Number(range.total || 0), minCreatedAt: range.minCreatedAt || null, maxCreatedAt: range.maxCreatedAt || null, byMonth };
}

async function identityAudit(req, res, db) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
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

  const accounts = await dateRangeAndMonthlyDistribution(db, 'crewcheck_platform_accounts');
  const profiles = await dateRangeAndMonthlyDistribution(db, 'crewcheck_platform_profiles');

  const [profilesWithoutAccountRows] = await db.query(
    'SELECT COUNT(*) AS count FROM crewcheck_platform_profiles p LEFT JOIN crewcheck_platform_accounts a ON a.email=p.email WHERE a.email IS NULL',
  );
  const [accountsWithoutProfileRows] = await db.query(
    'SELECT COUNT(*) AS count FROM crewcheck_platform_accounts a LEFT JOIN crewcheck_platform_profiles p ON p.email=a.email WHERE p.email IS NULL',
  );

  const ownership = [];
  for (const entry of IDENTITY_AUDIT_TABLES) {
    const [existsRows] = await db.query(
      'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1',
      [entry.table],
    );
    if (!existsRows[0]) {
      ownership.push({ table: entry.table, label: entry.label, exists: false });
      continue;
    }
    const [totalsRows] = await db.query(
      `SELECT COUNT(*) AS totalRows, COUNT(DISTINCT ${entry.ownerColumn}) AS distinctOwners FROM ${entry.table}`,
    );
    const [orphanedRows] = await db.query(
      `SELECT COUNT(DISTINCT t.${entry.ownerColumn}) AS orphanedOwners
       FROM ${entry.table} t
       LEFT JOIN crewcheck_platform_profiles p ON p.email=t.${entry.ownerColumn}
       LEFT JOIN crewcheck_platform_accounts a ON a.email=t.${entry.ownerColumn}
       WHERE p.email IS NULL AND a.email IS NULL`,
    );
    ownership.push({
      table: entry.table,
      label: entry.label,
      exists: true,
      totalRows: Number(totalsRows[0]?.totalRows || 0),
      distinctOwners: Number(totalsRows[0]?.distinctOwners || 0),
      orphanedOwners: Number(orphanedRows[0]?.orphanedOwners || 0),
    });
  }

  const [allTableRows] = await db.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
  const unexpectedTables = allTableRows.map((row) => row.name).filter((name) => !IDENTITY_AUDIT_KNOWN_TABLES.has(name));

  return sendJson(res, 200, {
    ok: true,
    accounts,
    profiles,
    profilesWithoutAccount: Number(profilesWithoutAccountRows[0]?.count || 0),
    accountsWithoutProfile: Number(accountsWithoutProfileRows[0]?.count || 0),
    ownership,
    unexpectedTables,
    note: 'Vínculo entre identidade e dados é feito por e-mail normalizado (não por ID) em todas as tabelas listadas - recriar a identidade com o mesmo e-mail reconecta automaticamente qualquer linha em "orphanedOwners" acima, dentro deste banco. Isso não alcança dados que possam ainda existir fora deste banco (ex.: um datastore anterior à migração para Aiven MySQL).',
    message: 'Auditoria somente leitura - nenhuma senha, hash, salt, token ou e-mail individual é retornado, apenas contagens agregadas e nomes de tabela.',
  });
}

// #399 follow-up: identity-audit found unexpectedTables in production
// (auth_accounts, crewcheck_users, crewcheck_rosters) sitting in the SAME schema as
// the current crewcheck_platform_* tables. This is a read-only, admin-only inspector
// for exactly that class of table: it never trusts a table/column name from the
// request - every identifier it ever interpolates into SQL was read moments earlier
// from information_schema itself, never from req.url or req.body. It reports schema
// (column names/types only), row counts, a date range when a created-at-shaped column
// exists, and - when an email-shaped column exists - whether stored values are already
// normalized and how many distinct values do/don't match a current account or profile.
// It never selects a raw row, a password/hash/salt/token value, or an individual email.
const LEGACY_CUTOVER_TIMESTAMP = '2026-07-15 00:00:00';
const LEGACY_EMAIL_COLUMN_PATTERN = /email/i;
const LEGACY_DATE_COLUMN_PATTERN = /created_at|inserted_at|registered_at|signup_at|joined_at/i;
const LEGACY_SENSITIVE_COLUMN_PATTERN = /password|hash|salt|token|secret|cipher|senha/i;
const LEGACY_TEXT_TYPES = new Set(['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext']);
const LEGACY_DATE_TYPES = new Set(['datetime', 'timestamp', 'date']);

async function legacyTableColumns(db, table) {
  const [rows] = await db.query(
    'SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable, COLUMN_KEY AS columnKey FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [table],
  );
  return rows.map((row) => ({ name: row.name, dataType: String(row.dataType || '').toLowerCase(), nullable: row.isNullable === 'YES', key: row.columnKey || null }));
}

async function legacyTableEmailAnalysis(db, table, column) {
  const [statRows] = await db.query(
    `SELECT COUNT(*) AS totalRows, COUNT(DISTINCT \`${column}\`) AS distinctValues,
            SUM(CASE WHEN \`${column}\` IS NOT NULL AND \`${column}\`<>LOWER(TRIM(\`${column}\`)) THEN 1 ELSE 0 END) AS nonNormalizedCount
     FROM \`${table}\``,
  );
  const [matchRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(t.\`${column}\`))) AS matchingCurrentIdentity
     FROM \`${table}\` t
     LEFT JOIN crewcheck_platform_accounts a ON a.email=LOWER(TRIM(t.\`${column}\`))
     LEFT JOIN crewcheck_platform_profiles p ON p.email=LOWER(TRIM(t.\`${column}\`))
     WHERE t.\`${column}\` IS NOT NULL AND (a.email IS NOT NULL OR p.email IS NOT NULL)`,
  );
  const [orphanRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(t.\`${column}\`))) AS orphanedFromCurrentIdentity
     FROM \`${table}\` t
     LEFT JOIN crewcheck_platform_accounts a ON a.email=LOWER(TRIM(t.\`${column}\`))
     LEFT JOIN crewcheck_platform_profiles p ON p.email=LOWER(TRIM(t.\`${column}\`))
     WHERE t.\`${column}\` IS NOT NULL AND a.email IS NULL AND p.email IS NULL`,
  );
  return {
    column,
    totalRows: Number(statRows[0]?.totalRows || 0),
    distinctValues: Number(statRows[0]?.distinctValues || 0),
    nonNormalizedCount: Number(statRows[0]?.nonNormalizedCount || 0),
    matchingCurrentIdentity: Number(matchRows[0]?.matchingCurrentIdentity || 0),
    orphanedFromCurrentIdentity: Number(orphanRows[0]?.orphanedFromCurrentIdentity || 0),
  };
}

// #399 follow-up: the legacy model links crewcheck_rosters to crewcheck_users by
// user_id (a UUID), never by e-mail - so the "recreate the identity with the same
// e-mail and everything reconnects" guarantee that holds for the owner_email-scoped
// crewcheck_platform_* tables (see identityAudit) does NOT hold for legacy rosters.
// Recovering them needs the bridge legacy user_id -> crewcheck_users.email
// (normalized) -> current identity to still be intact. This measures exactly that,
// read-only and admin-only, before any bridging/migration routine is written.
const LEGACY_ROSTER_BRIDGE_EMAIL_PATTERN = '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$';

async function legacyRosterBridgeAudit(db, tables) {
  const usersEntry = tables.find((entry) => entry.table === 'crewcheck_users');
  const rostersEntry = tables.find((entry) => entry.table === 'crewcheck_rosters');
  if (!usersEntry || !rostersEntry) {
    return { available: false, reason: 'crewcheck_users e/ou crewcheck_rosters não encontrados no schema atual.' };
  }
  const hasUsersId = usersEntry.columns.some((column) => column.name === 'id');
  const hasUsersEmail = usersEntry.columns.some((column) => column.name === 'email');
  const hasRostersUserId = rostersEntry.columns.some((column) => column.name === 'user_id');
  if (!hasUsersId || !hasUsersEmail || !hasRostersUserId) {
    return { available: false, reason: 'crewcheck_users.id/email ou crewcheck_rosters.user_id não encontrados - o schema ao vivo difere do modelo legado esperado.' };
  }

  const pattern = LEGACY_ROSTER_BRIDGE_EMAIL_PATTERN;
  const [matchedRosterRows] = await db.query(
    'SELECT COUNT(*) AS matchingRosters, COUNT(DISTINCT r.user_id) AS distinctUsersWithRoster FROM crewcheck_rosters r JOIN crewcheck_users u ON u.id=r.user_id',
  );
  const [orphanedRosterRows] = await db.query(
    'SELECT COUNT(*) AS orphanedRosters FROM crewcheck_rosters r LEFT JOIN crewcheck_users u ON u.id=r.user_id WHERE u.id IS NULL',
  );
  const [normalizableRows] = await db.query(
    'SELECT COUNT(*) AS normalizableEmailCount FROM crewcheck_users WHERE email IS NOT NULL AND email REGEXP ?',
    [pattern],
  );
  const [matchingIdentityRows] = await db.query(
    `SELECT COUNT(*) AS matchingCount FROM crewcheck_users u
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND (EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE a.email=LOWER(TRIM(u.email)))
         OR EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE p.email=LOWER(TRIM(u.email))))`,
    [pattern],
  );
  const [notMatchingIdentityRows] = await db.query(
    `SELECT COUNT(*) AS notMatchingCount FROM crewcheck_users u
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE a.email=LOWER(TRIM(u.email)))
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE p.email=LOWER(TRIM(u.email)))`,
    [pattern],
  );
  const [notMatchingWithRosterRows] = await db.query(
    `SELECT COUNT(DISTINCT u.id) AS count FROM crewcheck_users u
     JOIN crewcheck_rosters r ON r.user_id=u.id
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE a.email=LOWER(TRIM(u.email)))
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE p.email=LOWER(TRIM(u.email)))`,
    [pattern],
  );

  return {
    available: true,
    totalLegacyUsers: usersEntry.totalRows,
    totalLegacyRosters: rostersEntry.totalRows,
    distinctLegacyUsersWithRoster: Number(matchedRosterRows[0]?.distinctUsersWithRoster || 0),
    rostersMatchingLegacyUser: Number(matchedRosterRows[0]?.matchingRosters || 0),
    rostersWithoutLegacyUser: Number(orphanedRosterRows[0]?.orphanedRosters || 0),
    legacyUsersWithNormalizableEmail: Number(normalizableRows[0]?.normalizableEmailCount || 0),
    legacyUsersMatchingCurrentIdentity: Number(matchingIdentityRows[0]?.matchingCount || 0),
    legacyUsersNotMatchingCurrentIdentity: Number(notMatchingIdentityRows[0]?.notMatchingCount || 0),
    legacyUsersNotMatchingCurrentIdentityWithRoster: Number(notMatchingWithRosterRows[0]?.count || 0),
    rosterDateRange: rostersEntry.dateRange,
  };
}

async function legacyTableAudit(req, res, db) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
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

  const [allTableRows] = await db.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE()');
  const unexpectedTables = allTableRows.map((row) => row.name).filter((name) => !IDENTITY_AUDIT_KNOWN_TABLES.has(name));

  const tables = [];
  for (const table of unexpectedTables) {
    const columns = await legacyTableColumns(db, table);
    const [countRows] = await db.query(`SELECT COUNT(*) AS totalRows FROM \`${table}\``);
    const totalRows = Number(countRows[0]?.totalRows || 0);

    const dateColumn = columns.find((column) => LEGACY_DATE_COLUMN_PATTERN.test(column.name) && LEGACY_DATE_TYPES.has(column.dataType));
    let dateRange = null;
    if (dateColumn && totalRows > 0) {
      const [rangeRows] = await db.query(
        `SELECT MIN(\`${dateColumn.name}\`) AS minCreatedAt, MAX(\`${dateColumn.name}\`) AS maxCreatedAt,
                SUM(CASE WHEN \`${dateColumn.name}\`<? THEN 1 ELSE 0 END) AS beforeCutover
         FROM \`${table}\``,
        [LEGACY_CUTOVER_TIMESTAMP],
      );
      dateRange = {
        column: dateColumn.name,
        minCreatedAt: rangeRows[0]?.minCreatedAt || null,
        maxCreatedAt: rangeRows[0]?.maxCreatedAt || null,
        beforeCutover: Number(rangeRows[0]?.beforeCutover || 0),
      };
    }

    const emailColumns = columns.filter((column) => LEGACY_EMAIL_COLUMN_PATTERN.test(column.name) && LEGACY_TEXT_TYPES.has(column.dataType));
    const emailAnalysis = [];
    for (const column of emailColumns) {
      emailAnalysis.push(await legacyTableEmailAnalysis(db, table, column.name));
    }

    const sensitiveColumnNames = columns.filter((column) => LEGACY_SENSITIVE_COLUMN_PATTERN.test(column.name)).map((column) => column.name);

    tables.push({
      table,
      totalRows,
      columns: columns.map((column) => ({ name: column.name, dataType: column.dataType, nullable: column.nullable, key: column.key })),
      sensitiveColumnNames,
      dateRange,
      emailAnalysis,
    });
  }

  const rosterBridge = await legacyRosterBridgeAudit(db, tables);

  return sendJson(res, 200, {
    ok: true,
    cutoverTimestamp: LEGACY_CUTOVER_TIMESTAMP,
    tables,
    rosterBridge,
    note: 'orphanedFromCurrentIdentity conta valores distintos que não batem, por e-mail normalizado, com nenhuma conta/perfil atual - são os candidatos mais fortes a identidade "encalhada" dentro deste mesmo banco. sensitiveColumnNames lista apenas nomes de coluna (metadado de schema), nunca valores. rosterBridge mede especificamente o vínculo crewcheck_rosters.user_id -> crewcheck_users.id -> e-mail atual, que é por UUID e não por e-mail - a mesma garantia de reconexão automática das tabelas owner_email não se aplica a ele.',
    message: 'Auditoria somente leitura de tabelas fora do schema conhecido - nenhuma senha, hash, salt, token, UUID ou e-mail individual é retornado, apenas contagens agregadas, datas e nomes de coluna.',
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
  else if (url.pathname === '/api/auth/admin/identity-audit') await identityAudit(req, res, db);
  else if (url.pathname === '/api/auth/admin/legacy-table-audit') await legacyTableAudit(req, res, db);
  else if (url.pathname === '/api/auth/logout') {
    clearAuthCookie(res);
    sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
  } else sendJson(res, 404, { ok: false, message: 'Recurso de autenticação não localizado.' });
  return true;
}