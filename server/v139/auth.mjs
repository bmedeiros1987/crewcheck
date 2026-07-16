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
  if (!email) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail pessoal válido.' });
  if (blockedDomains().includes(email.split('@')[1])) {
    return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });
  }
  if (password.length < 8) return sendJson(res, 400, { ok: false, message: 'Use pelo menos 8 caracteres.' });
  const [existing] = await db.query('SELECT email FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
  if (existing[0]) return sendJson(res, 409, { ok: false, message: 'Este e-mail já possui cadastro. Use Recuperar senha.' });
  const digest = passwordDigest(password);
  await ensureProfile(db, email, name);
  await db.query(
    'INSERT INTO crewcheck_platform_accounts (email,password_hash,password_salt,must_change_password) VALUES(?,?,?,0)',
    [email, digest.hash, digest.salt],
  );
  return loginResponse(res, await userFromAccount(db, email), 'Cadastro concluído.');
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
    return loginResponse(res, await userFromAccount(db, email), 'Administrador conectado.');
  }
  if (!account || !passwordMatches(password, account.password_salt, account.password_hash)) {
    return sendJson(res, 401, { ok: false, message: 'E-mail ou senha inválidos.' });
  }
  await db.query('UPDATE crewcheck_platform_accounts SET last_login_at=CURRENT_TIMESTAMP(3) WHERE email=?', [email]);
  const user = await userFromAccount(db, email, Boolean(account.must_change_password));
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

  const [recent] = await db.query(
    'SELECT created_at FROM crewcheck_platform_password_resets WHERE email=? ORDER BY created_at DESC LIMIT 1',
    [email],
  );
  if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) return sendJson(res, 200, generic);

  const minutes = Math.max(5, Math.min(30, Number(env('CREWCHECK_PASSWORD_RESET_CODE_MINUTES', '10'))));
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const resetId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + minutes * 60_000);
  const link = await telegramLink(db, email);
  const channels = { email: false, telegram: false, telegramCall: false };
  await db.query(
    'INSERT INTO crewcheck_platform_password_resets (id,email,code_hash,expires_at,channels) VALUES(?,?,?,?,?)',
    [resetId, email, resetHash(email, code), expiresAt, JSON.stringify({ requested: delivery })],
  );

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
  const [rows] = await db.query(
    'SELECT * FROM crewcheck_platform_password_resets WHERE email=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [email],
  );
  const reset = rows[0];
  if (!reset || new Date(reset.expires_at).getTime() < Date.now() || Number(reset.attempts || 0) >= 5) {
    return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
  }
  if (!secureCompare(reset.code_hash, resetHash(email, code))) {
    await db.query('UPDATE crewcheck_platform_password_resets SET attempts=attempts+1 WHERE id=?', [reset.id]);
    return sendJson(res, 400, { ok: false, message: 'Código inválido ou expirado. Solicite outro.' });
  }
  const digest = passwordDigest(password);
  await db.query(
    'UPDATE crewcheck_platform_accounts SET password_hash=?,password_salt=?,must_change_password=0 WHERE email=?',
    [digest.hash, digest.salt, email],
  );
  await db.query('UPDATE crewcheck_platform_password_resets SET used_at=CURRENT_TIMESTAMP(3) WHERE id=?', [reset.id]);
  return sendJson(res, 200, { ok: true, message: 'Senha atualizada. Entre novamente.' });
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
  const [accounts] = await db.query('SELECT must_change_password FROM crewcheck_platform_accounts WHERE email=? LIMIT 1', [email]);
  return sendJson(res, 200, {
    ok: true,
    authenticated: true,
    user: await userFromAccount(db, email, Boolean(accounts[0]?.must_change_password)),
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
  else if (url.pathname === '/api/auth/logout') {
    clearAuthCookie(res);
    sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
  } else sendJson(res, 404, { ok: false, message: 'Recurso de autenticação não localizado.' });
  return true;
}
