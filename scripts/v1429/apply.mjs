import fs from 'node:fs';

const VERSION = '14.2.9';
function update(path, transform) {
  if (!fs.existsSync(path)) return;
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('server/v1410/partnerAccounts.mjs', (source) => {
  let next = source;
  next = next.replace(
    'async function ensurePartnerTable(db) {',
    `async function ensureEmailQuotaTable(db) {
  await db.query(\`CREATE TABLE IF NOT EXISTS crewcheck_email_monthly_usage (period_key CHAR(7) PRIMARY KEY, sent_count INT NOT NULL DEFAULT 0, monthly_limit INT NOT NULL DEFAULT 500, updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\`);
}
function currentEmailPeriod() { return new Date().toISOString().slice(0, 7); }
async function emailQuota(db) {
  await ensureEmailQuotaTable(db);
  const period = currentEmailPeriod();
  await db.query('INSERT IGNORE INTO crewcheck_email_monthly_usage (period_key,sent_count,monthly_limit) VALUES (?,0,500)', [period]);
  const [rows] = await db.query('SELECT period_key AS periodKey,sent_count AS sent,monthly_limit AS monthlyLimit,updated_at AS updatedAt FROM crewcheck_email_monthly_usage WHERE period_key=? LIMIT 1', [period]);
  const row = rows[0] || { periodKey: period, sent: 0, monthlyLimit: 500 };
  return { ...row, remaining: Math.max(0, Number(row.monthlyLimit || 500) - Number(row.sent || 0)) };
}
async function registerEmailSent(db, amount = 1) {
  await ensureEmailQuotaTable(db);
  await db.query('INSERT INTO crewcheck_email_monthly_usage (period_key,sent_count,monthly_limit) VALUES (?, ?, 500) ON DUPLICATE KEY UPDATE sent_count=sent_count+VALUES(sent_count)', [currentEmailPeriod(), Math.max(1, Number(amount || 1))]);
}

async function ensurePartnerTable(db) {`,
  );
  next = next.replace(
    '  return sendJson(res, 200, { ok: true, partners: rows });',
    "  const quota = await emailQuota(db);\n  return sendJson(res, 200, { ok: true, partners: rows, emailQuota: quota });",
  );
  next = next.replace(
    'async function deliverInvitation({ db, email, contactName, partnerName, temporaryPassword, emailSubject, emailBody, copyMe = true }) {',
    `async function deliverInvitation({ db, email, contactName, partnerName, temporaryPassword, emailSubject, emailBody, copyMe = true }) {
  const quota = await emailQuota(db);
  const required = copyMe ? 2 : 1;
  if (quota.remaining < required) return { requested: true, ok: false, provider: null, error: 'Limite mensal de 500 e-mails atingido. Aguarde a renovação da franquia.' };`,
  );
  next = next.replace(
    "  if (result.ok && copyMe) await sendSystemEmail({ to: 'bmedeiros1987@gmail.com'",
    "  if (result.ok) await registerEmailSent(db, 1);\n  if (result.ok && copyMe) { await sendSystemEmail({ to: 'bmedeiros1987@gmail.com'",
  );
  next = next.replace(
    "html: textToHtml(`Convite enviado para ${email}.\\n\\n${text}`), appendSignature: true, bcc: false, replyTo: false });",
    "html: textToHtml(`Convite enviado para ${email}.\\n\\n${text}`), appendSignature: true, bcc: false, replyTo: false }); await registerEmailSent(db, 1); }",
  );
  next = next.replace(
    "  const [rows] = await db.query('SELECT email,partner_name,contact_name FROM crewcheck_partner_accounts WHERE email=? LIMIT 1', [email]); const partner = rows[0];",
    "  const [rows] = await db.query('SELECT email,partner_name,contact_name,invitation_sent_at FROM crewcheck_partner_accounts WHERE email=? LIMIT 1', [email]); const partner = rows[0];",
  );
  next = next.replace(
    "  if (!partner) return sendJson(res, 404, { ok: false, message: 'Conta de parceiro não localizada.' });",
    `  if (!partner) return sendJson(res, 404, { ok: false, message: 'Conta de parceiro não localizada.' });
  if (partner.invitation_sent_at && Date.now() - new Date(partner.invitation_sent_at).getTime() < 120000) return sendJson(res, 429, { ok: false, message: 'Aguarde 2 minutos antes de reenviar este convite.' });`,
  );
  return next;
});

update('client/src/pages/AdminPartnerAccountsPage.tsx', (source) => {
  let next = source;
  next = next.replace(
    "const [partners,setPartners]=useState<PartnerRow[]>([]); const [loading,setLoading]=useState(true);",
    "const [partners,setPartners]=useState<PartnerRow[]>([]); const [emailQuota,setEmailQuota]=useState<{sent:number;monthlyLimit:number;remaining:number;periodKey:string}|null>(null); const [loading,setLoading]=useState(true);",
  );
  next = next.replace(
    "setPartners(payload.partners||[])",
    "setPartners(payload.partners||[]);setEmailQuota((payload as any).emailQuota||null)",
  );
  next = next.replace(
    '<header className="cc-partner-header"><div><span>Administração</span>',
    `<header className="cc-partner-header"><div><span>Administração</span>`,
  );
  next = next.replace(
    '    <form className="cc-partner-layout" onSubmit={createPartner}>',
    `    {emailQuota&&<section className="cc-email-quota"><div><strong>{emailQuota.sent} de {emailQuota.monthlyLimit}</strong><span>e-mails utilizados no ciclo {emailQuota.periodKey}</span></div><div><b>{emailQuota.remaining}</b><span>envios disponíveis</span></div><progress max={emailQuota.monthlyLimit} value={emailQuota.sent}/></section>}
    <form className="cc-partner-layout" onSubmit={createPartner}>`,
  );
  next = next.replace(
    '.cc-partner-layout{max-width:1240px;',
    '.cc-email-quota{max-width:1196px;margin:0 auto 20px;padding:18px 22px;border-radius:22px;background:#07162d;color:#fff;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;box-shadow:0 18px 44px rgba(26,46,78,.18)}.cc-email-quota div{display:grid;gap:4px}.cc-email-quota div:nth-child(2){text-align:right}.cc-email-quota strong,.cc-email-quota b{font-size:24px}.cc-email-quota span{color:#b9c9de}.cc-email-quota progress{grid-column:1/-1;width:100%;height:10px;accent-color:#e92f9d}.cc-partner-layout{max-width:1240px;',
  );
  return next;
});

update('client/src/main.tsx', (source) => source.includes('v1429/reliability-premium.css')
  ? source
  : source.replace('import "./components/v1428/audit-mode.css";', 'import "./components/v1428/audit-mode.css";\nimport "./components/v1429/reliability-premium.css";'));

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: confiabilidade visível, rota premium, convites e meteorologia acompanhada';`));

update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - premium reliability and operational visibility`;
  data.scripts ||= {};
  data.scripts['regression:v14.2.9'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-2-9-reliability.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1429] CrewCheck ${VERSION}: premium preservado, sobreposições bloqueadas, franquia de e-mail visível e reenvio protegido.`);
await import('../v1430/apply.mjs');
await import('../v1431/apply.mjs');
