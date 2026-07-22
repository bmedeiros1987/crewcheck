import fs from 'node:fs';

const VERSION = '14.3.6';
function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) { if (optional) return; throw new Error(`[v1436] Arquivo ausente: ${path}`); }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}
function insertAfter(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(`[v1436] Âncora não encontrada: ${label}`);
  return source.replace(anchor, `${anchor}\n${value}`);
}

update('client/src/lib/platformClient.ts', (source) => insertAfter(source,
  "export async function createVisitor(payload: { email: string; displayName?: string; telegram?: string; permissions: PlatformPermissions }) {\n  return authFetch<any>('/api/platform/visitors', { method: 'POST', body: JSON.stringify(payload) });\n}",
  "\nexport async function resendVisitorInvite(id: string) {\n  return authFetch<any>(`/api/platform/visitors/${encodeURIComponent(id)}/resend`, { method: 'POST', body: '{}' });\n}",
  'cliente de reenvio de convite'));

update('client/src/components/platform/PlatformCenter.tsx', (source) => {
  let next = source;
  next = next.replace('  revokeVisitor,\n', '  revokeVisitor,\n  resendVisitorInvite,\n');
  if (!next.includes("const [resendingVisitorId")) next = next.replace(
    "  const [editingPermissions, setEditingPermissions] = useState<PlatformPermissions>(defaultVisitorPermissions);\n  const [busy, setBusy] = useState(false);",
    "  const [editingPermissions, setEditingPermissions] = useState<PlatformPermissions>(defaultVisitorPermissions);\n  const [busy, setBusy] = useState(false);\n  const [resendingVisitorId, setResendingVisitorId] = useState('');",
  );
  if (!next.includes('async function resendInvite')) next = next.replace(
    "  async function remove(id: string) { try { await revokeVisitor(id); await load(); toast.success('Visitante revogado.'); } catch { toast.error('Não consegui revogar.'); } }",
    "  async function resendInvite(visitor: any) {\n    setResendingVisitorId(visitor.id); setFallback(null);\n    try {\n      const result = await resendVisitorInvite(visitor.id);\n      if (!result.emailSent) setFallback(result);\n      await load();\n      toast.success(result.message || 'Convite reenviado.');\n    } catch (err) { toast.error(err instanceof Error ? err.message : 'Não consegui reenviar o convite.'); }\n    finally { setResendingVisitorId(''); }\n  }\n  async function remove(id: string) { try { await revokeVisitor(id); await load(); toast.success('Visitante revogado.'); } catch { toast.error('Não consegui revogar.'); } }",
  );
  next = next.replace(
    "{visitor.status === 'active' && visitor.permissions?.chat && <button onClick={() => openChat(visitor.id)}><MessageCircle/> Chat</button>}{visitor.status !== 'revoked' && <button onClick={() => edit(visitor)}><ShieldCheck/> Permissões</button>}",
    "{visitor.status === 'active' && visitor.permissions?.chat && <button onClick={() => openChat(visitor.id)}><MessageCircle/> Chat</button>}{visitor.status !== 'revoked' && <button onClick={() => resendInvite(visitor)} disabled={resendingVisitorId === visitor.id}>{resendingVisitorId === visitor.id ? <Loader2 className=\"cp-spin\"/> : <Mail/>} Reenviar convite</button>}{visitor.status !== 'revoked' && <button onClick={() => edit(visitor)}><ShieldCheck/> Permissões</button>}",
  );
  if (!next.includes('resendVisitorInvite') || !next.includes('const [resendingVisitorId, setResendingVisitorId]')) throw new Error('[v1436] UI de reenvio não aplicada por completo.');
  return next;
});

update('client/src/App.tsx', (source) => source
  .replace('<span className="cc1270-loader-logo">✈</span>', '<span className="cc1270-loader-logo"><img src="/icons/crewcheck-icon-v2.png?v=1436" alt="CrewCheck" /></span>')
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`));

update('client/src/main.tsx', (source) => {
  if (source.includes('v1436/loading-contrast.css')) return source;
  const lines = source.split('\n');
  let lastImport = -1;
  lines.forEach((line, index) => { if (/^import\s/.test(line)) lastImport = index; });
  if (lastImport < 0) throw new Error('[v1436] Import não encontrado.');
  lines.splice(lastImport + 1, 0, 'import "./components/v1436/loading-contrast.css";');
  return lines.join('\n');
});

update('server/platform.mjs', (source) => {
  let next = source;
  next = next.replace(
    "  [/^\\/api\\/platform\\/visitors\\/[^/]+\\/revoke$/, ['POST']],",
    "  [/^\\/api\\/platform\\/visitors\\/[^/]+\\/revoke$/, ['POST']],\n  [/^\\/api\\/platform\\/visitors\\/[^/]+\\/resend$/, ['POST']],",
  );

  const visitorHandler = [
    'async function handleVisitorResend(req, res, id) {',
    '  const context = await requireMain(req, res);',
    '  if (!context) return;',
    "  if (!await requirePremium(context, res, 'Modo visitante')) return;",
    '  const visitorId = normalizeText(id, 80);',
    '  const found = await context.db.query("SELECT id,email,display_name,telegram,permissions,status FROM crewcheck_platform_visitors WHERE id=$1 AND owner_email=$2 AND status<>\'revoked\' LIMIT 1", [visitorId, context.identity.email]);',
    '  const visitor = found.rows[0];',
    "  if (!visitor) return sendJson(res, 404, { ok: false, message: 'Visitante não localizado ou revogado.' });",
    "  const token = crypto.randomBytes(32).toString('base64url');",
    "  const telegramToken = crypto.randomBytes(32).toString('base64url');",
    '  const password = temporaryPassword();',
    '  await context.db.query("UPDATE crewcheck_platform_visitors SET password_hash=$3,invite_token_hash=$4,telegram_token_hash=$5,status=\'invited\',must_change_password=TRUE,updated_at=NOW() WHERE id=$1 AND owner_email=$2", [visitorId, context.identity.email, passwordHash(password), sha256(token), sha256(telegramToken)]);',
    "  const link = publicBaseUrl(req) + '/visitor?token=' + encodeURIComponent(token);",
    "  const bot = env('TELEGRAM_BOT_USERNAME', env('CREWCHECK_TELEGRAM_BOT_USERNAME', 'crewchecknotify_bot')).replace(/^@/, '');",
    "  const telegramLink = 'https://t.me/' + bot + '?start=visitor_' + telegramToken;",
    '  const mail = await sendSystemEmail({',
    '    to: visitor.email,',
    "    subject: context.profile.display_name + ' reenviou seu convite do CrewCheck',",
    "    text: 'Seu convite CrewCheck foi renovado.\\n\\nLink: ' + link + '\\nSenha temporária: ' + password + '\\n\\nA senha anterior deixou de funcionar. No primeiro acesso, defina uma nova senha.\\nTelegram: ' + telegramLink,",
    "    html: '<div style=\"font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px\"><h1>Convite CrewCheck renovado</h1><p><b>' + escapeHtml(context.profile.display_name) + '</b> reenviou seu acesso de visitante.</p><p><a href=\"' + escapeHtml(link) + '\" style=\"display:inline-block;padding:14px 20px;border-radius:12px;background:#0b5678;color:#fff;text-decoration:none;font-weight:bold\">Aceitar convite</a></p><p>Nova senha temporária: <b>' + escapeHtml(password) + '</b></p><p>A senha temporária anterior foi invalidada.</p><p><a href=\"' + escapeHtml(telegramLink) + '\">Vincular Telegram</a></p></div>',",
    '  });',
    "  return sendJson(res, 200, { ok: true, id: visitorId, emailSent: mail.ok, link: mail.ok ? undefined : link, temporaryPassword: mail.ok ? undefined : password, telegramLink, permissions: allowedPermissions(visitor.permissions), message: mail.ok ? 'Convite reenviado com uma nova senha temporária.' : 'Convite renovado. Como o e-mail não foi entregue, compartilhe o novo link e a nova senha exibidos agora.' });",
    '}',
    '',
    'async function handleVisitorRevoke(req, res, id) {',
  ].join('\n');

  if (!next.includes('async function handleVisitorResend')) next = next.replace(
    'async function handleVisitorRevoke(req, res, id) {',
    visitorHandler,
  );
  next = next.replace(
    "    const visitorRevoke = url.pathname.match(/^\\/api\\/platform\\/visitors\\/([^/]+)\\/revoke$/);",
    "    const visitorResend = url.pathname.match(/^\\/api\\/platform\\/visitors\\/([^/]+)\\/resend$/);\n    if (visitorResend) { await handleVisitorResend(req, res, visitorResend[1]); return true; }\n    const visitorRevoke = url.pathname.match(/^\\/api\\/platform\\/visitors\\/([^/]+)\\/revoke$/);",
  );
  return next.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`);
}, { optional: true });

update('server.mjs', (source) => source.replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`).replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`).replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source.replace(/versionCode\s+\d+/, 'versionCode 140306').replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => { const data = JSON.parse(source); data.version = VERSION; data.description = `CrewCheck v${VERSION} - visitor invite resend, loading contrast and CrewLocker offline`; data.scripts ||= {}; data.scripts['regression:v14.3.6'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-6-visitor-loading.mjs'; return `${JSON.stringify(data, null, 2)}\n`; });

console.log(`[v1436] CrewCheck ${VERSION}: reenvio seguro de convite, nova senha temporária e carregamento com alto contraste.`);
