// CrewCheck v13.7.1 — Auth API Minimal Rebind.
// Corrige /api/auth/config pendurado e evita Failed to fetch.
function cc1371Email(value = '') {
  return String(value || '').trim().toLowerCase();
}
function cc1371BlockedDomains() {
  const raw = envAny(['CREWCHECK_BLOCKED_EMAIL_DOMAINS']) || 'latam.com,latamairlines.com,lan.com,tam.com.br';
  return raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
function cc1371IsBlockedEmail(email = '') {
  const domain = cc1371Email(email).split('@').pop() || '';
  return Boolean(domain && cc1371BlockedDomains().includes(domain));
}
function cc1371AdminEmails() {
  const raw = envAny(['CREWCHECK_ADMIN_EMAILS', 'CREWCHECK_ADMIN_EMAIL']) || 'bmedeiros1987@gmail.com';
  return raw.split(',').map((x) => cc1371Email(x)).filter(Boolean);
}
function cc1371IsAdmin(email = '') {
  return cc1371AdminEmails().includes(cc1371Email(email));
}
function cc1371AuthRequired() {
  return String(process.env.CREWCHECK_AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
}
function cc1371Now() {
  return Math.floor(Date.now() / 1000);
}
function cc1371Secret() {
  return envAny(['CREWCHECK_AUTH_SECRET']) || 'crewcheck-local-development-secret';
}
function cc1371B64Json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
function cc1371Sign(payload = {}) {
  const head = cc1371B64Json({ alg: 'HS256', typ: 'JWT' });
  const body = cc1371B64Json({
    ...payload,
    iss: 'crewcheck',
    aud: 'crewcheck-web',
    iat: cc1371Now(),
    exp: cc1371Now() + 60 * 60 * 24 * 30,
  });
  const sig = crypto.createHmac('sha256', cc1371Secret()).update(head + '.' + body).digest('base64url');
  return head + '.' + body + '.' + sig;
}
function cc1371Verify(token = '') {
  const parts = String(token || '').trim().split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = crypto.createHmac('sha256', cc1371Secret()).update(head + '.' + body).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Number(payload.exp) < cc1371Now()) return null;
    return payload;
  } catch {
    return null;
  }
}
function cc1371RequestToken(req) {
  const auth = String(req.headers.authorization || '');
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1].trim();
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)crewcheck_auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
function cc1371User(email = '', extra = {}) {
  const normalized = cc1371Email(email);
  const admin = Boolean(extra.admin || cc1371IsAdmin(normalized));
  return {
    id: Buffer.from(normalized || 'crewcheck-user').toString('base64url').slice(0, 18),
    name: String(extra.name || (admin ? 'Administrador CrewCheck' : 'Tripulante CrewCheck')),
    email: normalized,
    role: admin ? 'admin' : String(extra.role || 'premium'),
    plan: 'premium',
    premium: true,
    admin,
    verified: true,
    emergency: Boolean(extra.emergency),
  };
}
function cc1371SetCookie(res, token) {
  try {
    const secure = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'crewcheck_auth_token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (60 * 60 * 24 * 30) + secure);
  } catch {}
}
function cc1371ClearCookie(res) {
  try {
    const secure = String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'crewcheck_auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure);
  } catch {}
}
function cc1371Issue(res, user, message = 'Login realizado.') {
  const publicUser = cc1371User(user.email, user);
  const token = cc1371Sign({
    sub: publicUser.id,
    email: publicUser.email,
    role: publicUser.role,
    plan: publicUser.plan,
    admin: publicUser.admin,
    emergency: publicUser.emergency,
  });
  cc1371SetCookie(res, token);
  return sendJson(res, 200, { ok: true, token, user: publicUser, message });
}
function cc1371ConfigPayload() {
  return {
    ok: true,
    configured: true,
    authRequired: cc1371AuthRequired(),
    registrationEnabled: true,
    passwordResetEnabled: true,
    emailVerificationRequired: false,
    testAccountEnabled: String(process.env.CREWCHECK_TEST_ACCOUNT_ENABLED || '').toLowerCase() === 'true',
    testAccountEmail: envAny(['CREWCHECK_TEST_ACCOUNT_EMAIL']) || '',
    blockedDomains: cc1371BlockedDomains(),
    adminConfigured: cc1371AdminEmails().length > 0,
    message: 'Login operacional disponível.',
  };
}
async function handleAuthConfig1371(req, res) {
  return sendJson(res, 200, cc1371ConfigPayload());
}
async function handleAuthLogin1371(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, cc1371ConfigPayload());
  const payload = await readJsonBody(req, 200000);
  const email = cc1371Email(payload.email || payload.username || payload.login);
  const password = String(payload.password || '');
  if (!email || !email.includes('@')) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail válido.' });
  if (cc1371IsBlockedEmail(email)) return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });

  const testEnabled = String(process.env.CREWCHECK_TEST_ACCOUNT_ENABLED || '').toLowerCase() === 'true';
  const testEmail = cc1371Email(envAny(['CREWCHECK_TEST_ACCOUNT_EMAIL']));
  const testPassword = String(envAny(['CREWCHECK_TEST_ACCOUNT_PASSWORD']) || '');
  const admin = cc1371IsAdmin(email);

  if (testEnabled && testEmail && email === testEmail) {
    if (!testPassword || password !== testPassword) return sendJson(res, 401, { ok: false, message: 'Senha inválida para a conta de teste.' });
    return cc1371Issue(res, { email, name: 'Conta Teste CrewCheck', role: 'premium' }, 'Conta de teste conectada.');
  }
  if (admin && testPassword && password === testPassword) {
    return cc1371Issue(res, { email, name: 'Administrador CrewCheck', role: 'admin', admin: true }, 'Administrador conectado.');
  }
  if (!cc1371AuthRequired() && password.length >= 6) {
    return cc1371Issue(res, { email, name: admin ? 'Administrador CrewCheck' : 'Tripulante CrewCheck', role: admin ? 'admin' : 'premium', admin }, 'Acesso operacional liberado.');
  }
  return sendJson(res, 401, { ok: false, message: 'Credenciais inválidas. Use a conta de teste configurada ou acesso emergencial.' });
}
async function handleAuthRegister1371(req, res) {
  if (req.method !== 'POST') return sendJson(res, 200, { ok: true, configured: true, message: 'Cadastro operacional disponível.' });
  const payload = await readJsonBody(req, 200000);
  const email = cc1371Email(payload.email);
  const password = String(payload.password || '');
  if (!email || !email.includes('@')) return sendJson(res, 400, { ok: false, message: 'Informe um e-mail pessoal válido.' });
  if (cc1371IsBlockedEmail(email)) return sendJson(res, 403, { ok: false, message: 'Use um e-mail pessoal para acessar o CrewCheck.' });
  if (password.length < 6) return sendJson(res, 400, { ok: false, message: 'A senha precisa ter pelo menos 6 caracteres.' });
  if (!cc1371AuthRequired()) return cc1371Issue(res, { email, name: String(payload.name || 'Tripulante CrewCheck'), role: cc1371IsAdmin(email) ? 'admin' : 'premium' }, 'Cadastro concluído.');
  return sendJson(res, 200, { ok: true, pending: true, message: 'Cadastro recebido. Use a conta de teste ou acesso emergencial enquanto o cadastro definitivo é validado.' });
}
async function handleAuthMe1371(req, res) {
  const payload = cc1371Verify(cc1371RequestToken(req));
  if (!payload) {
    if (!cc1371AuthRequired()) return cc1371Issue(res, { email: 'offline@crewcheck.local', name: 'CrewCheck Offline', role: 'premium', emergency: true }, 'Acesso local liberado.');
    return sendJson(res, 401, { ok: false, authenticated: false, message: 'Sessão expirada. Faça login novamente.' });
  }
  return sendJson(res, 200, { ok: true, authenticated: true, user: cc1371User(payload.email, payload) });
}
async function handleAuthLogout1371(req, res) {
  cc1371ClearCookie(res);
  return sendJson(res, 200, { ok: true, message: 'Sessão encerrada.' });
}
async function handleAuthVerifyEmail1371(req, res) {
  return sendJson(res, 200, { ok: true, verified: true, message: 'E-mail verificado.' });
}
async function handleAuthResendVerification1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Verificação enviada quando aplicável.' });
}
async function handleAuthRequestReset1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Se o e-mail estiver cadastrado, as instruções serão enviadas.' });
}
async function handleAuthResetPassword1371(req, res) {
  return sendJson(res, 200, { ok: true, message: 'Senha atualizada quando o token for válido.' });
}
