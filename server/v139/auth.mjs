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
  'crewcheck_platform_roster_recovery_log',
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

// Production hit ER_CANT_AGGREGATE_2COLLATIONS the first time this audit compared a
// legacy-era text column against a current one: crewcheck_users/crewcheck_rosters
// predate the crewcheck_platform_* schema and can carry a different charset/collation
// on CHAR/VARCHAR columns, including id/user_id (never assume it's only e-mail).
// MySQL refuses to compare two explicit-collation strings that disagree, so every
// cross-era comparison below goes through CONVERT(... USING <charset>) COLLATE
// <collation> on BOTH sides, forcing them onto one common, explicitly-resolved target
// - resolved from crewcheck_platform_accounts.email's REAL live collation (falling
// back to profiles.email, then a hardcoded default), never guessed. This never
// touches schema or data - it only changes how the comparison is expressed inside a
// read-only query.
const LEGACY_COLLATION_REPORT_COLUMNS = [
  { table: 'crewcheck_users', column: 'id' },
  { table: 'crewcheck_users', column: 'email' },
  { table: 'crewcheck_rosters', column: 'user_id' },
  { table: 'crewcheck_platform_accounts', column: 'email' },
  { table: 'crewcheck_platform_profiles', column: 'email' },
];
const LEGACY_DEFAULT_COLLATION = { charset: 'utf8mb4', collation: 'utf8mb4_unicode_ci' };

async function legacyColumnCollationReport(db) {
  const report = [];
  for (const entry of LEGACY_COLLATION_REPORT_COLUMNS) {
    const [rows] = await db.query(
      'SELECT CHARACTER_SET_NAME AS charset, COLLATION_NAME AS collation FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
      [entry.table, entry.column],
    );
    const row = rows[0];
    report.push({ table: entry.table, column: entry.column, exists: Boolean(row), charset: row?.charset || null, collation: row?.collation || null });
  }
  return report;
}

function resolveCommonCollation(collationReport) {
  const accounts = collationReport.find((entry) => entry.table === 'crewcheck_platform_accounts' && entry.column === 'email');
  const profiles = collationReport.find((entry) => entry.table === 'crewcheck_platform_profiles' && entry.column === 'email');
  const source = (accounts?.collation && accounts) || (profiles?.collation && profiles) || null;
  return source ? { charset: source.charset || LEGACY_DEFAULT_COLLATION.charset, collation: source.collation } : LEGACY_DEFAULT_COLLATION;
}

function collateEq(leftExpr, rightExpr, common) {
  return `CONVERT(${leftExpr} USING ${common.charset}) COLLATE ${common.collation}=CONVERT(${rightExpr} USING ${common.charset}) COLLATE ${common.collation}`;
}

function legacyAuditErrorCode(error) {
  return String(error?.code) === 'ER_CANT_AGGREGATE_2COLLATIONS' ? 'COLLATION_MISMATCH' : 'QUERY_FAILED';
}

async function legacyTableColumns(db, table) {
  const [rows] = await db.query(
    'SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, IS_NULLABLE AS isNullable, COLUMN_KEY AS columnKey FROM information_schema.columns WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',
    [table],
  );
  return rows.map((row) => ({ name: row.name, dataType: String(row.dataType || '').toLowerCase(), nullable: row.isNullable === 'YES', key: row.columnKey || null }));
}

async function legacyTableEmailAnalysis(db, table, column, commonCollation) {
  const [statRows] = await db.query(
    `SELECT COUNT(*) AS totalRows, COUNT(DISTINCT \`${column}\`) AS distinctValues,
            SUM(CASE WHEN \`${column}\` IS NOT NULL AND \`${column}\`<>LOWER(TRIM(\`${column}\`)) THEN 1 ELSE 0 END) AS nonNormalizedCount
     FROM \`${table}\``,
  );
  const accountsEq = collateEq('a.email', `LOWER(TRIM(t.\`${column}\`))`, commonCollation);
  const profilesEq = collateEq('p.email', `LOWER(TRIM(t.\`${column}\`))`, commonCollation);
  const [matchRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(t.\`${column}\`))) AS matchingCurrentIdentity
     FROM \`${table}\` t
     LEFT JOIN crewcheck_platform_accounts a ON ${accountsEq}
     LEFT JOIN crewcheck_platform_profiles p ON ${profilesEq}
     WHERE t.\`${column}\` IS NOT NULL AND (a.email IS NOT NULL OR p.email IS NOT NULL)`,
  );
  const [orphanRows] = await db.query(
    `SELECT COUNT(DISTINCT LOWER(TRIM(t.\`${column}\`))) AS orphanedFromCurrentIdentity
     FROM \`${table}\` t
     LEFT JOIN crewcheck_platform_accounts a ON ${accountsEq}
     LEFT JOIN crewcheck_platform_profiles p ON ${profilesEq}
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

async function legacyRosterBridgeAudit(db, tables, commonCollation) {
  const usersEntry = tables.find((entry) => entry.table === 'crewcheck_users');
  const rostersEntry = tables.find((entry) => entry.table === 'crewcheck_rosters');
  if (!usersEntry || !rostersEntry) {
    return { available: false, reason: 'crewcheck_users e/ou crewcheck_rosters não encontrados no schema atual.' };
  }
  if (usersEntry.auditError || rostersEntry.auditError) {
    return { available: false, reason: 'crewcheck_users e/ou crewcheck_rosters retornaram erro ao inspecionar o schema - a ponte não pôde ser medida com segurança.' };
  }
  const hasUsersId = usersEntry.columns.some((column) => column.name === 'id');
  const hasUsersEmail = usersEntry.columns.some((column) => column.name === 'email');
  const hasRostersUserId = rostersEntry.columns.some((column) => column.name === 'user_id');
  if (!hasUsersId || !hasUsersEmail || !hasRostersUserId) {
    return { available: false, reason: 'crewcheck_users.id/email ou crewcheck_rosters.user_id não encontrados - o schema ao vivo difere do modelo legado esperado.' };
  }

  const pattern = LEGACY_ROSTER_BRIDGE_EMAIL_PATTERN;
  const idEq = collateEq('u.id', 'r.user_id', commonCollation);
  const accountsEq = collateEq('a.email', 'LOWER(TRIM(u.email))', commonCollation);
  const profilesEq = collateEq('p.email', 'LOWER(TRIM(u.email))', commonCollation);
  const [matchedRosterRows] = await db.query(
    `SELECT COUNT(*) AS matchingRosters, COUNT(DISTINCT r.user_id) AS distinctUsersWithRoster FROM crewcheck_rosters r JOIN crewcheck_users u ON ${idEq}`,
  );
  const [orphanedRosterRows] = await db.query(
    `SELECT COUNT(*) AS orphanedRosters FROM crewcheck_rosters r LEFT JOIN crewcheck_users u ON ${idEq} WHERE u.id IS NULL`,
  );
  const [normalizableRows] = await db.query(
    'SELECT COUNT(*) AS normalizableEmailCount FROM crewcheck_users WHERE email IS NOT NULL AND email REGEXP ?',
    [pattern],
  );
  const [matchingIdentityRows] = await db.query(
    `SELECT COUNT(*) AS matchingCount FROM crewcheck_users u
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND (EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE ${accountsEq})
         OR EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE ${profilesEq}))`,
    [pattern],
  );
  const [notMatchingIdentityRows] = await db.query(
    `SELECT COUNT(*) AS notMatchingCount FROM crewcheck_users u
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE ${accountsEq})
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE ${profilesEq})`,
    [pattern],
  );
  const [notMatchingWithRosterRows] = await db.query(
    `SELECT COUNT(DISTINCT u.id) AS count FROM crewcheck_users u
     JOIN crewcheck_rosters r ON ${collateEq('r.user_id', 'u.id', commonCollation)}
     WHERE u.email IS NOT NULL AND u.email REGEXP ?
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_accounts a WHERE ${accountsEq})
       AND NOT EXISTS (SELECT 1 FROM crewcheck_platform_profiles p WHERE ${profilesEq})`,
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

  let columnCollations = [];
  let commonCollation = LEGACY_DEFAULT_COLLATION;
  try {
    columnCollations = await legacyColumnCollationReport(db);
    commonCollation = resolveCommonCollation(columnCollations);
  } catch {
    // Metadata is best-effort and never blocks the rest of the audit - fall back to
    // the hardcoded default collation target if information_schema itself errors.
  }

  const tables = [];
  for (const table of unexpectedTables) {
    try {
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
        emailAnalysis.push(await legacyTableEmailAnalysis(db, table, column.name, commonCollation));
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
    } catch (error) {
      // One incompatible legacy table (unexpected charset/collation, or anything else
      // that fails a read-only query) must never take down the whole audit - it's
      // reported and the rest of the tables/rosterBridge still run normally.
      tables.push({ table, auditError: legacyAuditErrorCode(error) });
    }
  }

  let rosterBridge;
  try {
    rosterBridge = await legacyRosterBridgeAudit(db, tables, commonCollation);
  } catch (error) {
    rosterBridge = { available: false, reason: legacyAuditErrorCode(error) };
  }

  return sendJson(res, 200, {
    ok: true,
    cutoverTimestamp: LEGACY_CUTOVER_TIMESTAMP,
    columnCollations,
    tables,
    rosterBridge,
    note: 'orphanedFromCurrentIdentity conta valores distintos que não batem, por e-mail normalizado, com nenhuma conta/perfil atual - são os candidatos mais fortes a identidade "encalhada" dentro deste mesmo banco. sensitiveColumnNames lista apenas nomes de coluna (metadado de schema), nunca valores. rosterBridge mede especificamente o vínculo crewcheck_rosters.user_id -> crewcheck_users.id -> e-mail atual, que é por UUID e não por e-mail - a mesma garantia de reconexão automática das tabelas owner_email não se aplica a ele. columnCollations é metadado de schema (charset/collation), nunca um valor de linha; comparações entre eras diferentes são explicitamente convertidas para um collation comum dentro da própria query - nenhuma tabela ou dado de produção é alterado. auditError numa tabela (ex.: "COLLATION_MISMATCH") não impede o restante da auditoria de ser retornado.',
    message: 'Auditoria somente leitura de tabelas fora do schema conhecido - nenhuma senha, hash, salt, token, UUID ou e-mail individual é retornado, apenas contagens agregadas, datas e nomes de coluna.',
  });
}

// #399 recovery prep: legacyTableAudit()/rosterBridge give aggregate counts; this is
// the per-e-mail drill-down a human needs before deciding whether ONE specific
// account is actually recoverable. Admin-only, read-only, POST (email in body, same
// as diagnoseCredentialState). Never returns password_hash, salt, a legacy UUID, raw
// roster content, or any data belonging to an e-mail other than the one requested.
async function legacyRecoveryCandidate(req, res, db) {
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
  const email = safeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });

  const emptyResult = {
    ok: true,
    legacyUserExists: false,
    currentIdentityExists: false,
    legacyRosterCount: 0,
    legacyRosterMinCreatedAt: null,
    legacyRosterMaxCreatedAt: null,
    currentRosterCount: 0,
    recoveryCandidate: false,
    conflict: null,
  };

  try {
    // Never presume the legacy shape is there - confirm both tables AND the exact
    // columns this diagnostic depends on exist before referencing any of them
    // (same discipline as legacyRosterBridgeAudit's guard).
    const [columnRows] = await db.query(
      `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col FROM information_schema.columns
       WHERE TABLE_SCHEMA=DATABASE()
         AND ((TABLE_NAME='crewcheck_users' AND COLUMN_NAME IN ('id','email'))
           OR (TABLE_NAME='crewcheck_rosters' AND COLUMN_NAME IN ('user_id','created_at')))`,
    );
    const cols = new Set(columnRows.map((row) => `${row.tbl}.${row.col}`));
    const legacySchemaReady = ['crewcheck_users.id', 'crewcheck_users.email', 'crewcheck_rosters.user_id', 'crewcheck_rosters.created_at']
      .every((entry) => cols.has(entry));
    if (!legacySchemaReady) {
      return sendJson(res, 200, { ...emptyResult, message: 'Schema legado não encontrado ou difere do formato esperado - diagnóstico não pôde ser concluído.' });
    }

    const collationReport = await legacyColumnCollationReport(db);
    const commonCollation = resolveCommonCollation(collationReport);

    const [variantRows] = await db.query(
      `SELECT COUNT(*) AS variantCount FROM crewcheck_users WHERE ${collateEq('LOWER(TRIM(email))', '?', commonCollation)}`,
      [email],
    );
    const variantCount = Number(variantRows[0]?.variantCount || 0);
    const legacyUserExists = variantCount > 0;
    const conflict = variantCount > 1 ? { type: 'duplicate_legacy_user', count: variantCount } : null;

    let legacyRosterCount = 0;
    let legacyRosterMinCreatedAt = null;
    let legacyRosterMaxCreatedAt = null;
    if (legacyUserExists) {
      const idEq = collateEq('u.id', 'r.user_id', commonCollation);
      const emailEq = collateEq('LOWER(TRIM(u.email))', '?', commonCollation);
      const [rosterRows] = await db.query(
        `SELECT COUNT(*) AS total, MIN(r.created_at) AS minCreatedAt, MAX(r.created_at) AS maxCreatedAt
         FROM crewcheck_rosters r
         JOIN crewcheck_users u ON ${idEq}
         WHERE ${emailEq}`,
        [email],
      );
      legacyRosterCount = Number(rosterRows[0]?.total || 0);
      legacyRosterMinCreatedAt = rosterRows[0]?.minCreatedAt || null;
      legacyRosterMaxCreatedAt = rosterRows[0]?.maxCreatedAt || null;
    }

    const [accountRows] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
    const [profileRows] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [email]);
    const currentIdentityExists = Boolean(accountRows[0] || profileRows[0]);
    const [currentRosterRows] = await db.query('SELECT COUNT(*) AS total FROM crewcheck_platform_rosters WHERE owner_email=?', [email]);
    const currentRosterCount = Number(currentRosterRows[0]?.total || 0);

    const recoveryCandidate = legacyUserExists && legacyRosterCount > 0 && !conflict;

    return sendJson(res, 200, {
      ok: true,
      legacyUserExists,
      currentIdentityExists,
      legacyRosterCount,
      legacyRosterMinCreatedAt,
      legacyRosterMaxCreatedAt,
      currentRosterCount,
      recoveryCandidate,
      conflict,
      message: 'Diagnóstico somente leitura, restrito a um único e-mail - nenhuma senha, hash, salt, UUID legado ou conteúdo de roster é retornado.',
    });
  } catch (error) {
    return sendJson(res, 200, { ...emptyResult, error: legacyAuditErrorCode(error), message: 'Não foi possível concluir o diagnóstico com segurança.' });
  }
}

// #399 pilot recovery: converts ONE legacy user's rosters into the current schema.
// Every recovered roster is written active=false and the write path never touches
// the owner's current active roster - it deliberately does NOT call
// saveRosterMysql() (server/platform.mjs:1620), which unconditionally deactivates
// every existing roster for the owner before activating the new one. See
// docs/399_legacy_roster_recovery_plan.md §4a for why that function is unsafe here.
//
// legacySanitizeRoster()/legacyDeriveRosterKey()/legacyRosterFingerprint() below are
// intentionally byte-for-byte copies of platform.mjs's sanitizeRoster()/rosterKey()/
// rosterFingerprint() (never exported there) rather than a new cross-module import
// into that file during this investigation - regression-p0-legacy-roster-recovery.mjs
// asserts both copies stay behaviorally identical on the same inputs, so any future
// change to the canonical versions is caught here instead of silently drifting into
// "two independent engines".
//
// compliance/gym are stored empty ({}/[]) for every recovered roster: this
// codebase's compliance/gym scoring is computed client-side (see client/src/lib/*)
// and applied to whatever the browser sends in handleRosterSync() - there is no
// server-side engine to "recompute" them against. A recovered roster's compliance/
// gym are only ever populated once the user reopens/reprocesses it through the
// normal, existing import flow after their access is restored.
function legacySha256(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function legacySanitizeRoster(roster) {
  const clone = JSON.parse(JSON.stringify(roster || {}));
  clone.rawText = '';
  clone.days = Array.isArray(clone.days) ? clone.days.slice(0, 370).map((day) => ({
    ...day,
    rawText: '',
    legs: Array.isArray(day?.legs) ? day.legs.slice(0, 16) : [],
  })) : [];
  return clone;
}

function legacyDeriveRosterKey(roster) {
  return `${Number(roster?.year || 0)}-${String(Number(roster?.month || 0)).padStart(2, '0')}`;
}

function legacyRosterFingerprint(roster) {
  return legacySha256(JSON.stringify({ year: roster?.year, month: roster?.month, crewId: roster?.crewId, days: roster?.days }));
}

async function legacyRecoveryLogTableReady(db) {
  const [rows] = await db.query(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_roster_recovery_log' LIMIT 1",
  );
  return Boolean(rows[0]);
}

async function classifyLegacyRoster(db, { row, ordinal, ownerEmail }) {
  const periodLabel = `${row.period_year || '????'}-${String(row.period_month || 0).padStart(2, '0')}`;
  if (row.deleted_at) {
    return { ordinal, periodLabel, status: 'skipped', reason: 'legacy_deleted', row };
  }
  const [logRows] = await db.query(
    'SELECT status FROM crewcheck_platform_roster_recovery_log WHERE legacy_roster_id=? LIMIT 1',
    [row.id],
  );
  if (logRows[0]) {
    return { ordinal, periodLabel, status: 'already_recovered', reason: null, row };
  }

  let parsedContent = row.roster_json;
  if (typeof parsedContent === 'string') {
    try { parsedContent = JSON.parse(parsedContent); } catch { parsedContent = null; }
  }
  const hasUsableDays = parsedContent && Array.isArray(parsedContent.days) && parsedContent.days.length > 0
    && parsedContent.days.every((day) => day && typeof day === 'object' && day.date);
  if (!hasUsableDays) {
    const reason = !parsedContent && row.storage_provider ? 'external_storage_unavailable' : 'unrecognized_legacy_shape';
    return { ordinal, periodLabel, status: 'needs_manual_review', reason, row };
  }
  if (!row.period_year || !row.period_month) {
    return { ordinal, periodLabel, status: 'needs_manual_review', reason: 'missing_period', row };
  }

  const rosterForConversion = { year: Number(row.period_year), month: Number(row.period_month), crewId: row.crew_id || null, days: parsedContent.days };
  const rosterKeyValue = legacyDeriveRosterKey(rosterForConversion);
  const fingerprintValue = legacyRosterFingerprint(rosterForConversion);

  const [conflictRows] = await db.query(
    'SELECT roster_key, fingerprint FROM crewcheck_platform_rosters WHERE owner_email=? AND (roster_key=? OR fingerprint=?) LIMIT 1',
    [ownerEmail, rosterKeyValue, fingerprintValue],
  );
  if (conflictRows[0]) {
    const reason = conflictRows[0].roster_key === rosterKeyValue ? 'roster_key_exists' : 'fingerprint_exists';
    return { ordinal, periodLabel, status: 'conflict', reason, row };
  }

  return { ordinal, periodLabel, status: 'recoverable', reason: null, row, rosterForConversion, rosterKeyValue, fingerprintValue };
}

async function legacyRosterRecoveryPlan(db, ownerEmail) {
  const [accountRows] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [ownerEmail]);
  const [profileRows] = await db.query('SELECT email FROM crewcheck_platform_profiles WHERE email=? LIMIT 1', [ownerEmail]);
  const currentIdentityExists = Boolean(accountRows[0] || profileRows[0]);
  if (!currentIdentityExists) {
    return { blocked: true, reason: 'no_current_identity', currentIdentityExists: false, legacyUserExists: false, rosters: [] };
  }

  const recoveryLogReady = await legacyRecoveryLogTableReady(db);
  if (!recoveryLogReady) {
    return { blocked: true, reason: 'recovery_log_migration_pending', currentIdentityExists, legacyUserExists: false, rosters: [] };
  }

  const [columnRows] = await db.query(
    `SELECT TABLE_NAME AS tbl, COLUMN_NAME AS col FROM information_schema.columns
     WHERE TABLE_SCHEMA=DATABASE()
       AND ((TABLE_NAME='crewcheck_users' AND COLUMN_NAME IN ('id','email'))
         OR (TABLE_NAME='crewcheck_rosters' AND COLUMN_NAME IN ('id','user_id','created_at','deleted_at','period_year','period_month','crew_id','roster_json','source_file_name','storage_provider')))`,
  );
  const cols = new Set(columnRows.map((row) => `${row.tbl}.${row.col}`));
  const requiredCols = [
    'crewcheck_users.id', 'crewcheck_users.email',
    'crewcheck_rosters.id', 'crewcheck_rosters.user_id', 'crewcheck_rosters.created_at', 'crewcheck_rosters.deleted_at',
    'crewcheck_rosters.period_year', 'crewcheck_rosters.period_month', 'crewcheck_rosters.crew_id',
    'crewcheck_rosters.roster_json', 'crewcheck_rosters.source_file_name', 'crewcheck_rosters.storage_provider',
  ];
  const legacySchemaReady = requiredCols.every((entry) => cols.has(entry));
  if (!legacySchemaReady) {
    return { blocked: true, reason: 'legacy_schema_unavailable', currentIdentityExists, legacyUserExists: false, rosters: [] };
  }

  const collationReport = await legacyColumnCollationReport(db);
  const commonCollation = resolveCommonCollation(collationReport);

  const [variantRows] = await db.query(
    `SELECT COUNT(*) AS variantCount FROM crewcheck_users WHERE ${collateEq('LOWER(TRIM(email))', '?', commonCollation)}`,
    [ownerEmail],
  );
  const variantCount = Number(variantRows[0]?.variantCount || 0);
  if (variantCount === 0) {
    return { blocked: true, reason: 'no_legacy_user', currentIdentityExists, legacyUserExists: false, rosters: [] };
  }
  if (variantCount > 1) {
    return { blocked: true, reason: 'duplicate_legacy_user', currentIdentityExists, legacyUserExists: true, rosters: [] };
  }

  const idEq = collateEq('u.id', 'r.user_id', commonCollation);
  const emailEq = collateEq('LOWER(TRIM(u.email))', '?', commonCollation);
  const [legacyRosterRows] = await db.query(
    `SELECT r.id, r.created_at, r.deleted_at, r.period_year, r.period_month, r.crew_id,
            r.roster_json, r.source_file_name, r.storage_provider
     FROM crewcheck_rosters r
     JOIN crewcheck_users u ON ${idEq}
     WHERE ${emailEq}
     ORDER BY r.created_at ASC`,
    [ownerEmail],
  );

  const rosters = [];
  for (const [index, row] of legacyRosterRows.entries()) {
    rosters.push(await classifyLegacyRoster(db, { row, ordinal: index + 1, ownerEmail }));
  }

  return {
    blocked: false,
    reason: null,
    currentIdentityExists: true,
    legacyUserExists: true,
    rosters,
    recoverableCount: rosters.filter((entry) => entry.status === 'recoverable').length,
  };
}

function sanitizedPlanRosters(rosters) {
  return rosters.map(({ ordinal, periodLabel, status, reason }) => ({ ordinal, periodLabel, status, reason }));
}

// Fail-closed gate: execute() must never accept a bare {email} and go recover
// whatever it finds - it requires a token minted by a prior dry-run call for the
// EXACT SAME plan (same e-mail, same set of recoverable roster keys/fingerprints).
// If the plan changed since the dry-run (a conflict appeared, a roster was already
// recovered by another call, etc.) the signature changes and the token stops
// verifying, forcing a fresh dry-run rather than executing against a stale preview.
// Stateless by design (no extra table) - HMAC via authSecret(), same pattern this
// file already uses for password-reset/auth-artifact tokens.
const LEGACY_ROSTER_RECOVERY_TOKEN_TTL_MS = 15 * 60 * 1000;

function legacyRosterRecoveryPlanSignature(recoverable) {
  // legacy_roster_id is included alongside content (rosterKey:fingerprint) so the
  // token represents not just "what content" but "from which legacy row" - closing
  // even the theoretical case of two legacy rows sharing identical content
  // (same fingerprint) but a different source id.
  const parts = recoverable.map((entry) => `${entry.row.id}:${entry.rosterKeyValue}:${entry.fingerprintValue}`).sort();
  return legacySha256(parts.join('|'));
}

function legacyRosterRecoveryConfirmationMac(email, planSignature, issuedAtMs) {
  return crypto.createHmac('sha256', authSecret()).update(`legacy-roster-recovery|${email}|${planSignature}|${issuedAtMs}`).digest('hex');
}

function legacyRosterRecoveryConfirmationToken(email, planSignature, issuedAtMs = Date.now()) {
  return `${issuedAtMs}.${legacyRosterRecoveryConfirmationMac(email, planSignature, issuedAtMs)}`;
}

function legacyRosterRecoveryTokenValid(token, email, planSignature) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (dot <= 0) return false;
  const issuedAtMs = Number(raw.slice(0, dot));
  const mac = raw.slice(dot + 1);
  if (!Number.isFinite(issuedAtMs) || !mac) return false;
  const age = Date.now() - issuedAtMs;
  if (age < 0 || age > LEGACY_ROSTER_RECOVERY_TOKEN_TTL_MS) return false;
  return secureCompare(mac, legacyRosterRecoveryConfirmationMac(email, planSignature, issuedAtMs));
}

// Read-only. Never writes. Shares legacyRosterRecoveryPlan() with the execute
// endpoint below, so "what would happen" and "what actually happens" can never
// silently diverge into two different code paths.
async function legacyRosterRecoveryDryRun(req, res, db) {
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
  const email = safeEmail(body.email);
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });

  try {
    const plan = await legacyRosterRecoveryPlan(db, email);
    const recoverable = plan.blocked ? [] : plan.rosters.filter((entry) => entry.status === 'recoverable');
    const confirmationToken = recoverable.length > 0
      ? legacyRosterRecoveryConfirmationToken(email, legacyRosterRecoveryPlanSignature(recoverable))
      : null;
    return sendJson(res, 200, {
      ok: true,
      blocked: plan.blocked,
      blockedReason: plan.reason,
      currentIdentityExists: plan.currentIdentityExists,
      legacyUserExists: plan.legacyUserExists,
      recoverableCount: plan.blocked ? 0 : plan.recoverableCount,
      rosters: sanitizedPlanRosters(plan.rosters),
      confirmationToken,
      confirmationExpiresInSeconds: confirmationToken ? LEGACY_ROSTER_RECOVERY_TOKEN_TTL_MS / 1000 : null,
      message: confirmationToken
        ? 'Simulação somente leitura - nenhuma escrita foi realizada. Para executar, reenvie este confirmationToken em legacy-roster-recovery-execute dentro do prazo indicado; se o plano mudar, ele deixa de valer. Nenhuma senha, hash, salt, UUID legado ou conteúdo de roster é retornado.'
        : 'Simulação somente leitura - nenhuma escrita foi realizada. Nenhuma senha, hash, salt, UUID legado ou conteúdo de roster é retornado.',
    });
  } catch (error) {
    return sendJson(res, 200, { ok: false, blocked: true, blockedReason: legacyAuditErrorCode(error), rosters: [], message: 'Não foi possível concluir a simulação com segurança.' });
  }
}

// The only function in this file that writes a recovered roster. Requires an
// existing current identity (never creates one), requires the legacy bridge to
// resolve unambiguously, and commits all of one user's recoverable rosters in a
// single transaction - partial success for one user is never left committed.
async function legacyRosterRecoveryExecute(req, res, db) {
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
  const email = safeEmail(body.email);
  const confirmationToken = String(body.confirmationToken || '');
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
  if (!confirmationToken) {
    return sendJson(res, 400, { ok: false, message: 'confirmationToken obrigatório - rode legacy-roster-recovery-dry-run primeiro e reenvie o token retornado.' });
  }

  try {
    const plan = await legacyRosterRecoveryPlan(db, email);
    if (plan.blocked) {
      return sendJson(res, 200, { ok: true, executed: false, blockedReason: plan.reason, recoveredCount: 0, results: [] });
    }

    const recoverable = plan.rosters.filter((entry) => entry.status === 'recoverable');
    const nonRecoverable = sanitizedPlanRosters(plan.rosters.filter((entry) => entry.status !== 'recoverable'));

    if (recoverable.length === 0) {
      return sendJson(res, 200, { ok: true, executed: true, recoveredCount: 0, results: nonRecoverable, message: 'Nenhuma roster recuperável para este e-mail no momento.' });
    }

    if (!legacyRosterRecoveryTokenValid(confirmationToken, email, legacyRosterRecoveryPlanSignature(recoverable))) {
      return sendJson(res, 200, {
        ok: false, executed: false, blockedReason: 'confirmation_token_invalid_or_expired', recoveredCount: 0, results: [],
        message: 'Token de confirmação inválido, expirado, ou o plano mudou desde a simulação - rode um novo dry-run.',
      });
    }

    const connection = await db.getConnection();
    const recoveredResults = [];
    try {
      await connection.beginTransaction();
      for (const entry of recoverable) {
        const currentRosterId = crypto.randomUUID();
        const logId = crypto.randomUUID();
        const sanitizedRoster = legacySanitizeRoster(entry.rosterForConversion);
        await connection.query(
          `INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active)
           VALUES(?,?,?,?,?,?,?,?,FALSE)`,
          [
            currentRosterId, email, entry.rosterKeyValue,
            JSON.stringify(sanitizedRoster), JSON.stringify({}), JSON.stringify([]),
            String(entry.row.source_file_name || '').slice(0, 180), entry.fingerprintValue,
          ],
        );
        await connection.query(
          `INSERT INTO crewcheck_platform_roster_recovery_log(id,legacy_roster_id,owner_email,roster_key,current_roster_id,status,reason)
           VALUES(?,?,?,?,?,?,?)`,
          [logId, entry.row.id, email, entry.rosterKeyValue, currentRosterId, 'recovered', 'pilot_recovery'],
        );
        recoveredResults.push({ ordinal: entry.ordinal, periodLabel: entry.periodLabel, status: 'recovered', reason: null });
      }
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch {}
      throw error;
    } finally {
      connection.release();
    }

    return sendJson(res, 200, {
      ok: true,
      executed: true,
      recoveredCount: recoveredResults.length,
      results: [...recoveredResults, ...nonRecoverable],
      message: 'Rosters recuperadas gravadas como active=false - a escala atual do usuário não foi alterada. compliance/gym ficam vazios até o usuário reabrir/reprocessar a escala pelo fluxo de importação normal.',
    });
  } catch (error) {
    return sendJson(res, 200, { ok: false, executed: false, error: legacyAuditErrorCode(error), recoveredCount: 0, results: [] });
  }
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
  else if (url.pathname === '/api/auth/admin/legacy-recovery-candidate') await legacyRecoveryCandidate(req, res, db);
  else if (url.pathname === '/api/auth/admin/legacy-roster-recovery-dry-run') await legacyRosterRecoveryDryRun(req, res, db);
  else if (url.pathname === '/api/auth/admin/legacy-roster-recovery-execute') await legacyRosterRecoveryExecute(req, res, db);
  else if (url.pathname === '/api/auth/logout') {
    clearAuthCookie(res);
    sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
  } else sendJson(res, 404, { ok: false, message: 'Recurso de autenticação não localizado.' });
  return true;
}